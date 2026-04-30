import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Trial-expiry worker (B3):
 *  - org with expired trial + no active sub  → status flips to PAST_DUE
 *  - org PAST_DUE for >14 days               → status flips to CANCELED
 *
 * We exercise the worker function directly. Skipped if no DB is reachable.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
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

describe("trialExpiryWorker", () => {
  it.skipIf(!dbUp)("flips an expired-trial org with no active sub to PAST_DUE", async () => {
    const tag = `trialExp-${Date.now()}`;
    const plan = await prisma.plan.upsert({
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

    const org = await prisma.organization.create({
      data: { name: `Org-${tag}`, status: "TRIAL" },
    });
    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan.id,
        status: "INCOMPLETE",
        trialEndsAt: new Date(Date.now() - 86400_000), // yesterday
      },
    });

    const { trialExpiryWorker } = await import("../workers/trialExpiryWorker.js");
    await trialExpiryWorker({} as any);

    const after = await prisma.organization.findUnique({ where: { id: org.id } });
    expect(after?.status).toBe("PAST_DUE");

    await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it.skipIf(!dbUp)("flips an org PAST_DUE >14 days to CANCELED", async () => {
    const tag = `trialCanc-${Date.now()}`;
    const plan = await prisma.plan.upsert({
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

    const org = await prisma.organization.create({
      data: { name: `Org-${tag}`, status: "PAST_DUE" },
    });
    // Force updatedAt back > 14 days. Prisma normally manages updatedAt, so use raw SQL.
    const oldDate = new Date(Date.now() - 20 * 86400_000);
    await prisma.$executeRawUnsafe(
      `UPDATE "Organization" SET "updatedAt" = $1 WHERE id = $2`,
      oldDate,
      org.id
    );
    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan.id,
        status: "PAST_DUE",
      },
    });

    const { trialExpiryWorker } = await import("../workers/trialExpiryWorker.js");
    await trialExpiryWorker({} as any);

    const after = await prisma.organization.findUnique({ where: { id: org.id } });
    expect(after?.status).toBe("CANCELED");

    await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
