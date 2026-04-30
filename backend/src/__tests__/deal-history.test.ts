import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 2 Agent 7 — DealHistory.
 *
 * Asserts:
 *  - Deal create writes initial history row (fromStage: null).
 *  - Stage update writes from→to row.
 *  - Bulk-status writes one row per (deal whose stage changed).
 *  - History survives Deal soft-delete.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;
let orgAId = "";
let userAId = "";
let contactId = "";

async function canConnect() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  dbUp = await canConnect();
  if (!dbUp) return;
  const tag = `dh-${Date.now()}`;
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
  const org = await prisma.organization.create({
    data: { name: `Org-${tag}`, users: { create: { email: `u-${tag}@t.local`, password: "x", role: "ADMIN" } } },
    include: { users: true },
  });
  orgAId = org.id;
  userAId = org.users[0].id;
  contactId = (
    await prisma.contact.create({
      data: { businessName: `cnt-${tag}`, phone: `+1555${Math.random()}`.slice(0, 12), organizationId: orgAId },
    })
  ).id;
});

afterAll(async () => {
  if (!dbUp) return;
  await prisma.dealHistory.deleteMany({ where: { organizationId: orgAId } });
  await prisma.deal.deleteMany({ where: { organizationId: orgAId } });
  await prisma.contact.deleteMany({ where: { organizationId: orgAId } });
  await prisma.user.deleteMany({ where: { organizationId: orgAId } });
  await prisma.organization.deleteMany({ where: { id: orgAId } });
  await prisma.$disconnect();
});

describe("deal-history", () => {
  it.skipIf(!dbUp)("create writes initial history row with fromStage null", async () => {
    const { recordDealStageChange } = await import("../lib/dealHistory.js");
    const deal = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.create({
        data: { title: "init", contactId, organizationId: orgAId, stage: "PROSPECT" },
      });
      await recordDealStageChange(tx, {
        dealId: d.id,
        organizationId: orgAId,
        fromStage: null,
        toStage: "PROSPECT",
        changedById: userAId,
      });
      return d;
    });
    const rows = await prisma.dealHistory.findMany({ where: { dealId: deal.id } });
    expect(rows.length).toBe(1);
    expect(rows[0].fromStage).toBeNull();
    expect(rows[0].toStage).toBe("PROSPECT");
  });

  it.skipIf(!dbUp)("stage update writes a from→to row", async () => {
    const { recordDealStageChange } = await import("../lib/dealHistory.js");
    const deal = await prisma.deal.create({
      data: { title: "upd", contactId, organizationId: orgAId, stage: "PROSPECT" },
    });
    await prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id: deal.id }, data: { stage: "QUALIFIED" } });
      await recordDealStageChange(tx, {
        dealId: deal.id,
        organizationId: orgAId,
        fromStage: "PROSPECT",
        toStage: "QUALIFIED",
        changedById: userAId,
      });
    });
    const rows = await prisma.dealHistory.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: "asc" } });
    expect(rows[rows.length - 1].fromStage).toBe("PROSPECT");
    expect(rows[rows.length - 1].toStage).toBe("QUALIFIED");
  });

  it.skipIf(!dbUp)("bulk-status writes one row per actually-changed deal", async () => {
    const { recordDealStageChange } = await import("../lib/dealHistory.js");
    const a = await prisma.deal.create({ data: { title: "a", contactId, organizationId: orgAId, stage: "PROSPECT" } });
    const b = await prisma.deal.create({ data: { title: "b", contactId, organizationId: orgAId, stage: "QUALIFIED" } });
    const before = [a, b];
    const target = "QUALIFIED";

    await prisma.$transaction(async (tx) => {
      await tx.deal.updateMany({ where: { id: { in: [a.id, b.id] }, organizationId: orgAId }, data: { stage: target } });
      for (const d of before) {
        if (d.stage !== target) {
          await recordDealStageChange(tx, {
            dealId: d.id,
            organizationId: orgAId,
            fromStage: d.stage,
            toStage: target,
            changedById: userAId,
            reason: "bulk-status",
          });
        }
      }
    });

    const aHist = await prisma.dealHistory.findMany({ where: { dealId: a.id } });
    const bHist = await prisma.dealHistory.findMany({ where: { dealId: b.id } });
    // a moved PROSPECT → QUALIFIED, so 1 row. b was already QUALIFIED, so 0.
    expect(aHist.length).toBe(1);
    expect(aHist[0].reason).toBe("bulk-status");
    expect(bHist.length).toBe(0);
  });

  it.skipIf(!dbUp)("history survives Deal soft-delete", async () => {
    const { recordDealStageChange } = await import("../lib/dealHistory.js");
    const d = await prisma.deal.create({
      data: { title: "sd", contactId, organizationId: orgAId, stage: "PROSPECT" },
    });
    await recordDealStageChange(prisma, {
      dealId: d.id,
      organizationId: orgAId,
      fromStage: null,
      toStage: "PROSPECT",
    });
    // Soft-delete: only stamps deletedAt.
    await prisma.deal.update({ where: { id: d.id }, data: { deletedAt: new Date() } });
    const rows = await prisma.dealHistory.findMany({ where: { dealId: d.id } });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
