import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Tenant-isolation exploit test.
 *
 * Goal: prove whether `findUnique({ where: { id, organizationId } })` in
 * tenant-scoped routes actually filters by organizationId, or silently
 * ignores it and returns any tenant's record by id.
 *
 * Approach: use a real Postgres (same DATABASE_URL the app uses). Create
 * two orgs, one campaign owned by Org A, then query it with a where-clause
 * scoped to Org B. If we get back the Org A row, the bug is exploitable.
 *
 * This test requires a live DB. It is skipped automatically when
 * `DATABASE_URL` is not reachable so `vitest run` stays green in CI bootstrap.
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
let orgAId = "";
let orgBId = "";
let campaignAId = "";

beforeAll(async () => {
  dbUp = await canConnect();
  if (!dbUp) return;

  // Isolate with a suffix so we don't clash with real data.
  const tag = `isoTest-${Date.now()}`;

  const freePlan = await prisma.plan.findFirst({ where: { tier: "FREE" } });
  if (!freePlan) {
    // Ensure there's a plan for FK; seed a throwaway one if needed.
    await prisma.plan.upsert({
      where: { tier: "FREE" },
      update: {},
      create: {
        tier: "FREE",
        name: "Free (test)",
        stripePriceId: `price_test_${tag}`,
        monthlyCallQuota: 100,
        monthlyLeadQuota: 100,
        seatLimit: 5,
        priceCents: 0,
      },
    });
  }

  const pwHash = await bcrypt.hash("pw-only-for-test", 10);

  const orgA = await prisma.organization.create({
    data: {
      name: `OrgA-${tag}`,
      users: { create: { email: `a-${tag}@test.local`, password: pwHash, role: "ADMIN" } },
    },
  });
  const orgB = await prisma.organization.create({
    data: {
      name: `OrgB-${tag}`,
      users: { create: { email: `b-${tag}@test.local`, password: pwHash, role: "ADMIN" } },
    },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  const campA = await prisma.campaign.create({
    data: { name: `CampA-${tag}`, organizationId: orgAId, status: "DRAFT" },
  });
  campaignAId = campA.id;
});

afterAll(async () => {
  if (!dbUp) return;
  // Best-effort cleanup.
  await prisma.campaign.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("tenant-isolation: findUnique({ where: { id, organizationId } })", () => {
  it.skipIf(!dbUp)("must NOT return Org A's campaign when queried as Org B", async () => {
    // This mirrors the pattern used throughout routes/campaigns.ts:
    //   prisma.campaign.findUnique({ where: { id, organizationId } })
    // If Prisma silently drops `organizationId`, we'll get orgA's row back.
    const leak = await prisma.campaign.findUnique({
      where: { id: campaignAId, organizationId: orgBId },
    });

    expect(leak).toBeNull();
  });

  it.skipIf(!dbUp)("returns the campaign when queried by its real owner", async () => {
    const own = await prisma.campaign.findUnique({
      where: { id: campaignAId, organizationId: orgAId },
    });
    expect(own).not.toBeNull();
    expect(own?.id).toBe(campaignAId);
  });
});
