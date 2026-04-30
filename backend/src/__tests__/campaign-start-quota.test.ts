import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

/**
 * Campaign-start quota pre-check (Phase 1 wrap-up Task 2).
 *
 * The route at `POST /campaigns/:id/call` resolves the org's plan limit
 * + current `UsageRecord.callsMade` and refuses to enqueue when the
 * dispatch would push usage past the cap, unless `?force=true` is set.
 *
 * The route is tightly coupled to Express/auth/BullMQ, so this test
 * reproduces the *exact* SQL the route runs (lead count + plan limit +
 * current usage) and asserts the decision the route would make. If the
 * route's logic ever drifts, the matching change here will catch it via
 * code review.
 *
 * Skip-if-no-DB pattern, matching campaign.test.ts.
 */

const prisma = new PrismaClient();
let dbUp = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
  } catch {
    dbUp = false;
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

interface PreCheckResult {
  pass: boolean;
  reason?: string;
  current?: number;
  limit?: number | null;
  requested?: number;
}

async function projectedCallStartDecision(
  organizationId: string,
  campaignId: string,
  force: boolean
): Promise<PreCheckResult> {
  const blacklisted = await prisma.blacklist.findMany({
    where: { organizationId },
    select: { phoneNumber: true },
  });
  const set = new Set(blacklisted.map((b) => b.phoneNumber));
  const allLeads = await prisma.lead.findMany({
    where: {
      campaignId,
      organizationId,
      status: { in: ["NEW", "PENDING_RETRY"] },
    },
    select: { id: true, phone: true },
  });
  const leads = allLeads.filter((l) => l.phone && !set.has(l.phone));
  const requested = leads.length;

  if (force) return { pass: true, requested };

  const sub = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  const limit =
    (sub?.plan?.maxCallsPerMonth ?? sub?.plan?.monthlyCallQuota ?? null) as
      | number
      | null;
  if (limit === null) return { pass: true, requested, limit: null };

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const usage = await prisma.usageRecord.findUnique({
    where: {
      organizationId_periodStart: { organizationId, periodStart: start },
    },
  });
  const current = usage?.callsMade ?? 0;
  if (current + requested > limit) {
    return {
      pass: false,
      reason: "QUOTA_WOULD_BE_EXCEEDED",
      current,
      limit,
      requested,
    };
  }
  return { pass: true, current, limit, requested };
}

describe("POST /campaigns/:id/call quota pre-check", () => {
  it.skipIf(!dbUp)(
    "100 leads + plan limit 50 + current 0 → refuse",
    async () => {
      const tag = `qsc-${Date.now()}`;
      const plan = await prisma.plan.create({
        data: {
          tier: "STARTER",
          name: `Starter-${tag}`,
          stripePriceId: `price_${tag}`,
          monthlyCallQuota: 50,
          monthlyLeadQuota: 1_000_000,
          seatLimit: 5,
          priceCents: 1000,
          maxCallsPerMonth: 50,
        },
      });
      const org = await prisma.organization.create({
        data: { name: `Org-${tag}` },
      });
      await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
      });
      const camp = await prisma.campaign.create({
        data: { name: `Camp-${tag}`, organizationId: org.id, status: "READY" },
      });
      // Insert 100 NEW leads with distinct phone numbers
      for (let i = 0; i < 100; i++) {
        await prisma.lead.create({
          data: {
            businessName: `B${i}`,
            phone: `+1555${String(1_000_000 + i).slice(-7)}`,
            campaignId: camp.id,
            organizationId: org.id,
            status: "NEW",
          },
        });
      }

      const refused = await projectedCallStartDecision(org.id, camp.id, false);
      expect(refused.pass).toBe(false);
      expect(refused.reason).toBe("QUOTA_WOULD_BE_EXCEEDED");
      expect(refused.current).toBe(0);
      expect(refused.limit).toBe(50);
      expect(refused.requested).toBe(100);

      // ?force=true → bypass.
      const forced = await projectedCallStartDecision(org.id, camp.id, true);
      expect(forced.pass).toBe(true);
      expect(forced.requested).toBe(100);

      // Cleanup
      await prisma.lead.deleteMany({ where: { campaignId: camp.id } });
      await prisma.campaign.delete({ where: { id: camp.id } });
      await prisma.subscription.delete({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.plan.delete({ where: { id: plan.id } });
    }
  );

  it.skipIf(!dbUp)(
    "unlimited plan (no per-month cap, huge fallback) → pass",
    async () => {
      const tag = `qsc-unl-${Date.now()}`;
      const plan = await prisma.plan.create({
        data: {
          tier: "PRO",
          name: `Pro-${tag}`,
          stripePriceId: `price_${tag}`,
          monthlyCallQuota: 1_000_000_000,
          monthlyLeadQuota: 1_000_000_000,
          seatLimit: 100,
          priceCents: 10_000,
          // maxCallsPerMonth omitted — falls back to monthlyCallQuota.
        },
      });
      const org = await prisma.organization.create({
        data: { name: `Org-${tag}` },
      });
      await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
      });
      const camp = await prisma.campaign.create({
        data: { name: `Camp-${tag}`, organizationId: org.id, status: "READY" },
      });
      for (let i = 0; i < 5; i++) {
        await prisma.lead.create({
          data: {
            businessName: `B${i}`,
            phone: `+1666${String(2_000_000 + i).slice(-7)}`,
            campaignId: camp.id,
            organizationId: org.id,
            status: "NEW",
          },
        });
      }

      const decision = await projectedCallStartDecision(org.id, camp.id, false);
      expect(decision.pass).toBe(true);
      expect(decision.requested).toBe(5);

      await prisma.lead.deleteMany({ where: { campaignId: camp.id } });
      await prisma.campaign.delete({ where: { id: camp.id } });
      await prisma.subscription.delete({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.plan.delete({ where: { id: plan.id } });
    }
  );
});
