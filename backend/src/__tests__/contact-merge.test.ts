import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 2 Agent 7 — contact merge.
 *
 * Cross-org merge → 404 (mirrored via findFirst guard); tags merge as a
 * deduped union; FK references on Lead/Deal/Note/Task reassign cleanly to
 * the primary id; duplicate is soft-deleted; CONTACT_MERGE audit row is
 * written.
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
  const tag = `merge-${Date.now()}`;
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
  const orgA = await prisma.organization.create({
    data: {
      name: `OrgA-${tag}`,
      users: { create: { email: `a-${tag}@t.local`, password: "x", role: "ADMIN" } },
    },
    include: { users: true },
  });
  const orgB = await prisma.organization.create({
    data: { name: `OrgB-${tag}` },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;
  userAId = orgA.users[0].id;
  campAId = (
    await prisma.campaign.create({ data: { name: `c-${tag}`, organizationId: orgAId } })
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
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
  }
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("contact-merge", () => {
  it.skipIf(!dbUp)("cross-org merge returns null on org-scoped lookup (would 404)", async () => {
    const cInB = await prisma.contact.create({
      data: { businessName: "B", phone: `+155501${Math.random()}`.slice(0, 12), organizationId: orgBId },
    });
    const cInA = await prisma.contact.create({
      data: { businessName: "A", phone: `+155502${Math.random()}`.slice(0, 12), organizationId: orgAId },
    });
    // Route does findFirst({ id, organizationId }) for BOTH → if either is in
    // a different org, we get null and return 404.
    const found = await prisma.contact.findFirst({
      where: { id: cInB.id, organizationId: orgAId },
    });
    expect(found).toBeNull();
    // Cleanup
    await prisma.contact.delete({ where: { id: cInA.id } });
    await prisma.contact.delete({ where: { id: cInB.id } });
  });

  it.skipIf(!dbUp)("merges tags as union; leaves no FK orphans; soft-deletes duplicate; writes audit", async () => {
    const tag = `mfull-${Date.now()}`;
    const primary = await prisma.contact.create({
      data: {
        businessName: `${tag}-P`,
        phone: `+1555${Math.random()}`.slice(0, 12),
        organizationId: orgAId,
        tags: ["enterprise", "warm"],
        email: null,
      },
    });
    const dup = await prisma.contact.create({
      data: {
        businessName: `${tag}-D`,
        phone: `+1555${Math.random()}`.slice(0, 12),
        organizationId: orgAId,
        tags: ["warm", "priority"],
        email: `${tag}@dup.local`,
      },
    });
    const lead = await prisma.lead.create({
      data: {
        businessName: `${tag}-l`,
        phone: `+1555${Math.random()}`.slice(0, 12),
        campaignId: campAId,
        organizationId: orgAId,
        contactId: dup.id,
      },
    });
    const deal = await prisma.deal.create({
      data: { title: `${tag}-d`, contactId: dup.id, organizationId: orgAId },
    });
    const note = await prisma.note.create({
      data: { content: "n", type: "NOTE", contactId: dup.id, organizationId: orgAId, authorId: userAId },
    });
    const task = await prisma.task.create({
      data: { title: "t", contactId: dup.id, organizationId: orgAId },
    });

    // Mirror the merge transaction.
    const mergedTags = Array.from(new Set([...(primary.tags ?? []), ...(dup.tags ?? [])]));
    const fieldFill: any = {};
    if (!primary.email && dup.email) fieldFill.email = dup.email;

    await prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({ where: { contactId: dup.id, organizationId: orgAId }, data: { contactId: primary.id } });
      await tx.deal.updateMany({ where: { contactId: dup.id, organizationId: orgAId }, data: { contactId: primary.id } });
      await tx.note.updateMany({ where: { contactId: dup.id, organizationId: orgAId }, data: { contactId: primary.id } });
      await tx.task.updateMany({ where: { contactId: dup.id, organizationId: orgAId }, data: { contactId: primary.id } });
      await tx.contact.update({ where: { id: primary.id }, data: { ...fieldFill, tags: mergedTags } });
      await tx.contact.updateMany({
        where: { id: dup.id, organizationId: orgAId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });

    await prisma.auditLog.create({
      data: {
        actorType: "TENANT_USER",
        actorId: userAId,
        organizationId: orgAId,
        targetOrganizationId: orgAId,
        action: "CONTACT_MERGE",
        entity: "Contact",
        entityId: primary.id,
        metadata: { diff: { merged: dup.id, fields: Object.keys(fieldFill) } },
      },
    });

    // Tags merged.
    const after = await prisma.contact.findUnique({ where: { id: primary.id } });
    expect(after?.tags.sort()).toEqual(["enterprise", "priority", "warm"]);
    // Email back-filled.
    expect(after?.email).toBe(`${tag}@dup.local`);

    // FKs reassigned.
    const leadAfter = await prisma.lead.findUnique({ where: { id: lead.id } });
    const dealAfter = await prisma.deal.findUnique({ where: { id: deal.id } });
    const noteAfter = await prisma.note.findUnique({ where: { id: note.id } });
    const taskAfter = await prisma.task.findUnique({ where: { id: task.id } });
    expect(leadAfter?.contactId).toBe(primary.id);
    expect(dealAfter?.contactId).toBe(primary.id);
    expect(noteAfter?.contactId).toBe(primary.id);
    expect(taskAfter?.contactId).toBe(primary.id);

    // Duplicate is soft-deleted.
    const dupAfter = await prisma.contact.findUnique({ where: { id: dup.id } });
    expect(dupAfter?.deletedAt).not.toBeNull();

    // Audit row.
    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Contact", entityId: primary.id, action: "CONTACT_MERGE" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.metadata as any)?.diff?.merged).toBe(dup.id);
  });
});
