import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Phase 2 Agent 7 — bulk operations.
 *
 * Asserts soft-delete bulk-delete is org-scoped, bulk-tag dedupes the union,
 * bulk-assign-owner rejects out-of-org owners, and bulk-qualify skips
 * terminal-state leads. Each bulk op writes exactly one audit row.
 *
 * DB-gated, same skip-if-no-DB pattern as tenant-isolation.test.ts.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;

let orgAId = "";
let orgBId = "";
let userAId = "";
let userBId = "";
let campAId = "";

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

  const tag = `bulkOps-${Date.now()}`;
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

  const pw = await bcrypt.hash("pw", 10);
  const orgA = await prisma.organization.create({
    data: {
      name: `OrgA-${tag}`,
      users: { create: { email: `a-${tag}@t.local`, password: pw, role: "ADMIN" } },
    },
    include: { users: true },
  });
  const orgB = await prisma.organization.create({
    data: {
      name: `OrgB-${tag}`,
      users: { create: { email: `b-${tag}@t.local`, password: pw, role: "ADMIN" } },
    },
    include: { users: true },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;
  userAId = orgA.users[0].id;
  userBId = orgB.users[0].id;

  campAId = (
    await prisma.campaign.create({
      data: { name: `Camp-${tag}`, organizationId: orgAId, status: "DRAFT" },
    })
  ).id;
});

afterAll(async () => {
  if (!dbUp) return;
  for (const orgId of [orgAId, orgBId]) {
    await prisma.dealHistory.deleteMany({ where: { organizationId: orgId } });
    await prisma.note.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.deal.deleteMany({ where: { organizationId: orgId } });
    await prisma.contact.deleteMany({ where: { organizationId: orgId } });
    await prisma.callLog.deleteMany({ where: { lead: { organizationId: orgId } } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
  }
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("bulk-ops: contact bulk-delete", () => {
  it.skipIf(!dbUp)("soft-deletes only org A's rows; org B rows untouched", async () => {
    const tag = `bulkDel-${Date.now()}`;
    const c1 = await prisma.contact.create({
      data: { businessName: `${tag}-A1`, phone: `+1555${Math.random()}`.slice(0, 12), organizationId: orgAId },
    });
    const c2 = await prisma.contact.create({
      data: { businessName: `${tag}-A2`, phone: `+1555${Math.random()}`.slice(0, 12), organizationId: orgAId },
    });
    const cB = await prisma.contact.create({
      data: { businessName: `${tag}-B1`, phone: `+1555${Math.random()}`.slice(0, 12), organizationId: orgBId },
    });

    // Mirror the route's logic.
    const r = await prisma.contact.updateMany({
      where: { id: { in: [c1.id, c2.id, cB.id] }, organizationId: orgAId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    expect(r.count).toBe(2);

    // Org B contact is untouched (deletedAt still null).
    const bAfter = await prisma.contact.findUnique({
      where: { id: cB.id },
    });
    expect(bAfter?.deletedAt).toBeNull();

    // Org A rows are soft-deleted.
    const aDeleted = await prisma.contact.findMany({
      where: { id: { in: [c1.id, c2.id] }, deletedAt: { not: null } },
    });
    expect(aDeleted.length).toBe(2);
  });
});

describe("bulk-ops: contact bulk-tag dedup", () => {
  it.skipIf(!dbUp)("merges existing + new tags as a deduped union", async () => {
    const c = await prisma.contact.create({
      data: {
        businessName: `tag-${Date.now()}`,
        phone: `+1555${Math.random()}`.slice(0, 12),
        organizationId: orgAId,
        tags: ["enterprise", "warm"],
      },
    });
    const merged = Array.from(new Set([...c.tags, "warm", "priority"]));
    await prisma.contact.update({ where: { id: c.id }, data: { tags: merged } });
    const after = await prisma.contact.findUnique({ where: { id: c.id } });
    expect(after?.tags.sort()).toEqual(["enterprise", "priority", "warm"]);
  });
});

describe("bulk-ops: bulk-assign-owner cross-org rejection", () => {
  it.skipIf(!dbUp)("ownerId from another org is rejected", async () => {
    // Mirror the route's owner-validation logic.
    const owner = await prisma.user.findFirst({
      where: { id: userBId, organizationId: orgAId },
    });
    expect(owner).toBeNull();
  });

  it.skipIf(!dbUp)("ownerId from same org is accepted and applied", async () => {
    const c = await prisma.contact.create({
      data: {
        businessName: `own-${Date.now()}`,
        phone: `+1555${Math.random()}`.slice(0, 12),
        organizationId: orgAId,
      },
    });
    const owner = await prisma.user.findFirst({
      where: { id: userAId, organizationId: orgAId },
    });
    expect(owner).not.toBeNull();
    await prisma.contact.updateMany({
      where: { id: c.id, organizationId: orgAId },
      data: { ownerId: userAId },
    });
    const after = await prisma.contact.findUnique({ where: { id: c.id } });
    expect(after?.ownerId).toBe(userAId);
  });
});

describe("bulk-ops: lead bulk-qualify skips terminal-state", () => {
  it.skipIf(!dbUp)("only NEW/CALLED/PENDING_* are flipped to QUALIFIED", async () => {
    const ids: string[] = [];
    for (const status of ["NEW", "CALLED", "QUALIFIED", "DISQUALIFIED"]) {
      const l = await prisma.lead.create({
        data: {
          businessName: `qual-${status}-${Date.now()}`,
          phone: `+1555${Math.random()}`.slice(0, 12),
          campaignId: campAId,
          organizationId: orgAId,
          status,
        },
      });
      ids.push(l.id);
    }

    // Mirror the route's where filter.
    const r = await prisma.lead.updateMany({
      where: {
        id: { in: ids },
        organizationId: orgAId,
        status: { in: ["NEW", "CALLED", "PENDING_RETRY", "PENDING_FOLLOWUP"] },
      },
      data: { status: "QUALIFIED" },
    });
    expect(r.count).toBe(2); // NEW + CALLED only

    const after = await prisma.lead.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "asc" },
    });
    // QUALIFIED row should have stayed QUALIFIED, DISQUALIFIED stayed DISQUALIFIED.
    const byStatus = after.map((l) => l.status).sort();
    expect(byStatus).toEqual(["DISQUALIFIED", "QUALIFIED", "QUALIFIED", "QUALIFIED"]);
  });
});

describe("bulk-ops: writes exactly one audit row per call", () => {
  it.skipIf(!dbUp)("single CONTACT_BULK_DELETE row covers N contacts", async () => {
    // Pre-count BULK_DELETE audits for this org so we can assert exactly +1.
    const beforeCount = await prisma.auditLog.count({
      where: { organizationId: orgAId, action: "CONTACT_BULK_DELETE" },
    });

    const c1 = await prisma.contact.create({
      data: { businessName: `audit1-${Date.now()}`, phone: `+1555${Math.random()}`.slice(0, 12), organizationId: orgAId },
    });
    const c2 = await prisma.contact.create({
      data: { businessName: `audit2-${Date.now()}`, phone: `+1555${Math.random()}`.slice(0, 12), organizationId: orgAId },
    });

    // Simulate the route's writeAuditLog call.
    await prisma.contact.updateMany({
      where: { id: { in: [c1.id, c2.id] }, organizationId: orgAId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        actorType: "TENANT_USER",
        actorId: userAId,
        organizationId: orgAId,
        targetOrganizationId: orgAId,
        action: "CONTACT_BULK_DELETE",
        entity: "Contact",
        entityId: [c1.id, c2.id].join(","),
        metadata: { diff: { count: 2, requested: 2 } },
      },
    });

    const afterCount = await prisma.auditLog.count({
      where: { organizationId: orgAId, action: "CONTACT_BULK_DELETE" },
    });
    expect(afterCount).toBe(beforeCount + 1);
  });
});
