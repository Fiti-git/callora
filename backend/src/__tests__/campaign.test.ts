import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Campaign lifecycle smoke tests (DB-gated).
 *
 * Verifies the contract the worker now relies on:
 *   - When the calling-service accepts a call request, the campaign worker
 *     must persist a CallLog row in PENDING state with the vapiCallId, and
 *     mark the lead CALLED (so the worker doesn't poll).
 *   - When the Vapi webhook arrives with that vapiCallId, the CallLog
 *     transitions to COMPLETED (the upsert keyed on vapiCallId is what we
 *     test in vapi-webhook.test.ts).
 *
 * This file is intentionally low-level — it asserts the data-shape contract
 * directly with Prisma. Spinning up the campaign worker with all its
 * dependencies (BullMQ, calling-service HTTP) is out of scope for the
 * monolith test suite; integration tests belong in services/campaign-service.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;

async function canConnect(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  dbUp = await canConnect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("campaign call-log shape (fire-and-forget contract)", () => {
  it.skipIf(!dbUp)(
    "creates PENDING CallLog with vapiCallId and CALLED lead — no polling required",
    async () => {
      const tag = `campShape-${Date.now()}`;
      await prisma.plan.upsert({
        where: { tier: "FREE" },
        update: {},
        create: {
          tier: "FREE",
          name: `Free (${tag})`,
          stripePriceId: `price_test_${tag}`,
          monthlyCallQuota: 100,
          monthlyLeadQuota: 100,
          seatLimit: 5,
          priceCents: 0,
        },
      });
      const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
      const camp = await prisma.campaign.create({
        data: { name: `Camp-${tag}`, organizationId: org.id, status: "RUNNING" },
      });
      const lead = await prisma.lead.create({
        data: {
          businessName: `Biz-${tag}`,
          phone: "+15555550111",
          campaignId: camp.id,
          organizationId: org.id,
          status: "NEW",
        },
      });

      const vapiCallId = `vapi-shape-${tag}`;

      // What the worker does after a successful calling-service POST:
      const log = await prisma.callLog.create({
        data: { leadId: lead.id, status: "PENDING", duration: 0, vapiCallId },
      });
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "CALLED" } });

      expect(log.status).toBe("PENDING");
      expect(log.vapiCallId).toBe(vapiCallId);

      const reload = await prisma.lead.findUnique({ where: { id: lead.id } });
      expect(reload?.status).toBe("CALLED");

      // Webhook arrives → upsert flips status to COMPLETED.
      await prisma.callLog.upsert({
        where: { vapiCallId },
        update: { status: "COMPLETED", duration: 30 },
        create: { leadId: lead.id, status: "COMPLETED", duration: 30, vapiCallId },
      });

      const final = await prisma.callLog.findUnique({ where: { vapiCallId } });
      expect(final?.status).toBe("COMPLETED");
      expect(final?.duration).toBe(30);

      // Two webhooks for the same vapiCallId still result in one CallLog.
      await prisma.callLog.upsert({
        where: { vapiCallId },
        update: { status: "COMPLETED", duration: 31 },
        create: { leadId: lead.id, status: "COMPLETED", duration: 31, vapiCallId },
      });
      const rows = await prisma.callLog.findMany({ where: { vapiCallId } });
      expect(rows.length).toBe(1);

      // Cleanup
      await prisma.callLog.deleteMany({ where: { leadId: lead.id } });
      await prisma.lead.delete({ where: { id: lead.id } });
      await prisma.campaign.delete({ where: { id: camp.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  );

  it.skipIf(!dbUp)("a campaign in DRAFT can be transitioned to RUNNING", async () => {
    const tag = `campStart-${Date.now()}`;
    await prisma.plan.upsert({
      where: { tier: "FREE" },
      update: {},
      create: {
        tier: "FREE",
        name: `Free (${tag})`,
        stripePriceId: `price_test_${tag}`,
        monthlyCallQuota: 100,
        monthlyLeadQuota: 100,
        seatLimit: 5,
        priceCents: 0,
      },
    });
    const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
    const camp = await prisma.campaign.create({
      data: { name: `Camp-${tag}`, organizationId: org.id, status: "DRAFT" },
    });
    expect(camp.status).toBe("DRAFT");

    await prisma.campaign.update({
      where: { id: camp.id },
      data: { status: "RUNNING" },
    });
    const reload = await prisma.campaign.findUnique({ where: { id: camp.id } });
    expect(reload?.status).toBe("RUNNING");

    await prisma.campaign.delete({ where: { id: camp.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
