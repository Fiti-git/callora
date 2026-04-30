import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  meterAndCharge,
  QuotaExceededError,
} from "../lib/quota.js";

/**
 * Tests for meterAndCharge — atomic per-kind quota check & increment.
 *
 * Requires a live Postgres (DATABASE_URL). Skips automatically if the DB
 * is not reachable, matching the pattern in tenant-isolation.test.ts.
 *
 * Plan.tier is `@unique`, so we reuse a single test plan across the file
 * and mutate its per-kind limits between tests. Each test gets its own
 * fresh organization + subscription so usage counters don't leak.
 */

const prisma = new PrismaClient();

async function canConnect(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

let dbUp = false;
let testPlanId = "";
const orgIds: string[] = [];

beforeAll(async () => {
  dbUp = await canConnect();
  if (!dbUp) return;

  // Find an existing tier we can hijack (or create a brand-new one if the
  // DB is empty). We choose ENTERPRISE because it's least likely to be
  // exercised by other tests, and we restore its key fields in afterAll.
  const existing = await prisma.plan.findUnique({ where: { tier: "ENTERPRISE" } });
  if (existing) {
    testPlanId = existing.id;
  } else {
    const created = await prisma.plan.create({
      data: {
        tier: "ENTERPRISE",
        name: "meter-test-plan",
        stripePriceId: `price_meter_test_${Date.now()}`,
        monthlyCallQuota: 1_000_000,
        monthlyLeadQuota: 1_000_000,
        seatLimit: 1000,
        priceCents: 0,
      },
    });
    testPlanId = created.id;
  }
});

async function makeOrg(tag: string): Promise<string> {
  const org = await prisma.organization.create({
    data: { name: `meter-org-${tag}-${Date.now()}` },
  });
  await prisma.subscription.create({
    data: { organizationId: org.id, planId: testPlanId, status: "ACTIVE" },
  });
  orgIds.push(org.id);
  return org.id;
}

async function setLimits(limits: {
  monthlyCallQuota?: number;
  maxCallsPerMonth?: number | null;
  maxPlacesPerMonth?: number | null;
  maxGeminiTokensPerMonth?: number | null;
  maxEmailsPerMonth?: number | null;
}) {
  await prisma.plan.update({
    where: { id: testPlanId },
    data: {
      monthlyCallQuota: limits.monthlyCallQuota ?? 1_000_000,
      maxCallsPerMonth: limits.maxCallsPerMonth ?? null,
      maxPlacesPerMonth: limits.maxPlacesPerMonth ?? null,
      maxGeminiTokensPerMonth: limits.maxGeminiTokensPerMonth ?? null,
      maxEmailsPerMonth: limits.maxEmailsPerMonth ?? null,
    },
  });
}

afterAll(async () => {
  if (!dbUp) return;
  for (const id of orgIds) {
    try {
      await prisma.usageRecord.deleteMany({ where: { organizationId: id } });
      await prisma.subscription.deleteMany({ where: { organizationId: id } });
      await prisma.organization.delete({ where: { id } });
    } catch {
      /* best effort */
    }
  }
  // Reset the plan limits to "unlimited" so we don't leave the test plan
  // in an unexpected state if it was a pre-existing seeded plan.
  try {
    await prisma.plan.update({
      where: { id: testPlanId },
      data: {
        maxCallsPerMonth: null,
        maxPlacesPerMonth: null,
        maxGeminiTokensPerMonth: null,
        maxEmailsPerMonth: null,
      },
    });
  } catch {
    /* best effort */
  }
  await prisma.$disconnect();
});

describe("meterAndCharge", () => {
  it.skipIf(!dbUp)(
    "unlimited plan (null limits + huge fallback) never throws",
    async () => {
      await setLimits({ monthlyCallQuota: 1_000_000 });
      const orgId = await makeOrg("unl");
      for (let i = 0; i < 5; i++) {
        await meterAndCharge(orgId, "VAPI_CALL", 1);
      }
      const usage = await prisma.usageRecord.findFirst({ where: { organizationId: orgId } });
      expect(usage?.callsMade).toBe(5);
    }
  );

  it.skipIf(!dbUp)("VAPI_CALL: 99/100 + 2 throws QuotaExceededError", async () => {
    await setLimits({ maxCallsPerMonth: 100 });
    const orgId = await makeOrg("cap");
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await prisma.usageRecord.create({
      data: {
        organizationId: orgId,
        periodStart: start,
        periodEnd: end,
        callsMade: 99,
      },
    });
    await expect(meterAndCharge(orgId, "VAPI_CALL", 2)).rejects.toThrow(
      QuotaExceededError
    );
    try {
      await meterAndCharge(orgId, "VAPI_CALL", 2);
    } catch (e: any) {
      expect(e.kind).toBe("VAPI_CALL");
      expect(e.current).toBe(99);
      expect(e.limit).toBe(100);
      expect(e.units).toBe(2);
      expect(e).toBeInstanceOf(Error);
    }
  });

  it.skipIf(!dbUp)(
    "two concurrent meterAndCharge calls cannot both pass the same limit",
    async () => {
      await setLimits({ maxCallsPerMonth: 1 });
      const orgId = await makeOrg("cnc");
      const results = await Promise.allSettled([
        meterAndCharge(orgId, "VAPI_CALL", 1),
        meterAndCharge(orgId, "VAPI_CALL", 1),
      ]);
      const successes = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r) => r.status === "rejected").length;
      expect(successes).toBe(1);
      expect(failures).toBe(1);
      const usage = await prisma.usageRecord.findFirst({
        where: { organizationId: orgId },
      });
      expect(usage?.callsMade).toBe(1);
    }
  );

  it.skipIf(!dbUp)("PLACES increments placesScraped and respects its limit", async () => {
    await setLimits({ maxPlacesPerMonth: 5 });
    const orgId = await makeOrg("pl");
    await meterAndCharge(orgId, "PLACES", 3);
    const u1 = await prisma.usageRecord.findFirst({ where: { organizationId: orgId } });
    expect(u1?.placesScraped).toBe(3);
    await expect(meterAndCharge(orgId, "PLACES", 3)).rejects.toThrow(
      QuotaExceededError
    );
  });

  it.skipIf(!dbUp)(
    "GEMINI_TOKEN increments aiTokens (regression for B9 — never recorded before)",
    async () => {
      await setLimits({ maxGeminiTokensPerMonth: 1000 });
      const orgId = await makeOrg("gem");
      await meterAndCharge(orgId, "GEMINI_TOKEN", 250);
      const u = await prisma.usageRecord.findFirst({
        where: { organizationId: orgId },
      });
      expect(u?.aiTokens).toBe(250);
    }
  );

  it.skipIf(!dbUp)("EMAIL increments emailsSent and respects its limit", async () => {
    await setLimits({ maxEmailsPerMonth: 2 });
    const orgId = await makeOrg("em");
    await meterAndCharge(orgId, "EMAIL", 1);
    await meterAndCharge(orgId, "EMAIL", 1);
    await expect(meterAndCharge(orgId, "EMAIL", 1)).rejects.toThrow(
      QuotaExceededError
    );
    const u = await prisma.usageRecord.findFirst({
      where: { organizationId: orgId },
    });
    expect(u?.emailsSent).toBe(2);
  });
});
