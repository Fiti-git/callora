import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Extended tenant-isolation matrix.
 *
 * For every tenant-owned row category, prove that a query scoped to a foreign
 * organizationId returns null. Mirrors the route pattern of `findFirst({
 * where: { id, organizationId } })` used throughout backend/src/routes.
 *
 * Skips automatically when DATABASE_URL is unreachable.
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
const ids: Record<string, string> = {};

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
  if (!dbUp) return;

  const tag = `tenIsoExt-${Date.now()}`;
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

  const orgA = await prisma.organization.create({ data: { name: `OrgA-${tag}` } });
  const orgB = await prisma.organization.create({ data: { name: `OrgB-${tag}` } });
  orgAId = orgA.id;
  orgBId = orgB.id;

  const campaign = await prisma.campaign.create({
    data: { name: `Camp-${tag}`, organizationId: orgAId, status: "DRAFT" },
  });
  ids.campaign = campaign.id;

  const lead = await prisma.lead.create({
    data: {
      businessName: `Biz-${tag}`,
      phone: "+15555550999",
      campaignId: campaign.id,
      organizationId: orgAId,
    },
  });
  ids.lead = lead.id;

  const contact = await prisma.contact.create({
    data: {
      businessName: `Contact-${tag}`,
      phone: "+15555551000",
      organizationId: orgAId,
    },
  });
  ids.contact = contact.id;

  const deal = await prisma.deal.create({
    data: {
      title: `Deal-${tag}`,
      value: 1000,
      stage: "PROSPECT",
      organizationId: orgAId,
    },
  });
  ids.deal = deal.id;

  const task = await prisma.task.create({
    data: { title: `Task-${tag}`, organizationId: orgAId },
  });
  ids.task = task.id;

  const note = await prisma.note.create({
    data: { content: `Note-${tag}`, type: "NOTE", organizationId: orgAId },
  });
  ids.note = note.id;

  const bl = await prisma.blacklist.create({
    data: { phoneNumber: `+1555555${Math.floor(Math.random() * 10000)}`, organizationId: orgAId },
  });
  ids.blacklist = bl.id;
});

afterAll(async () => {
  if (!dbUp) return;
  for (const orgId of [orgAId, orgBId]) {
    await prisma.note.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.deal.deleteMany({ where: { organizationId: orgId } });
    await prisma.contact.deleteMany({ where: { organizationId: orgId } });
    await prisma.callLog.deleteMany({ where: { lead: { organizationId: orgId } } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
    await prisma.blacklist.deleteMany({ where: { organizationId: orgId } });
    await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
  }
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("extended tenant-isolation matrix", () => {
  const cases: Array<{ name: string; key: keyof typeof ids; query: () => any }> = [
    { name: "campaign", key: "campaign", query: () => prisma.campaign.findFirst({ where: { id: ids.campaign, organizationId: orgBId } }) },
    { name: "lead", key: "lead", query: () => prisma.lead.findFirst({ where: { id: ids.lead, organizationId: orgBId } }) },
    { name: "contact", key: "contact", query: () => prisma.contact.findFirst({ where: { id: ids.contact, organizationId: orgBId } }) },
    { name: "deal", key: "deal", query: () => prisma.deal.findFirst({ where: { id: ids.deal, organizationId: orgBId } }) },
    { name: "task", key: "task", query: () => prisma.task.findFirst({ where: { id: ids.task, organizationId: orgBId } }) },
    { name: "note", key: "note", query: () => prisma.note.findFirst({ where: { id: ids.note, organizationId: orgBId } }) },
    { name: "blacklist", key: "blacklist", query: () => prisma.blacklist.findFirst({ where: { id: ids.blacklist, organizationId: orgBId } }) },
  ];

  for (const c of cases) {
    it.skipIf(!dbUp)(`${c.name}: org B cannot find org A's row`, async () => {
      const leak = await c.query();
      expect(leak).toBeNull();
    });
  }

  it.skipIf(!dbUp)("listing as org B excludes org A's rows for every category", async () => {
    const [camps, leads, contacts, deals, tasks, notes, bl] = await Promise.all([
      prisma.campaign.findMany({ where: { organizationId: orgBId } }),
      prisma.lead.findMany({ where: { organizationId: orgBId } }),
      prisma.contact.findMany({ where: { organizationId: orgBId } }),
      prisma.deal.findMany({ where: { organizationId: orgBId } }),
      prisma.task.findMany({ where: { organizationId: orgBId } }),
      prisma.note.findMany({ where: { organizationId: orgBId } }),
      prisma.blacklist.findMany({ where: { organizationId: orgBId } }),
    ]);
    expect(camps.length).toBe(0);
    expect(leads.length).toBe(0);
    expect(contacts.length).toBe(0);
    expect(deals.length).toBe(0);
    expect(tasks.length).toBe(0);
    expect(notes.length).toBe(0);
    expect(bl.length).toBe(0);
  });

  it.skipIf(!dbUp)("delete scoped to org B does not affect org A's rows", async () => {
    // updateMany / deleteMany scoped to wrong org should be a no-op.
    const before = await prisma.campaign.findUnique({ where: { id: ids.campaign } });
    expect(before).not.toBeNull();
    const r = await prisma.campaign.deleteMany({
      where: { id: ids.campaign, organizationId: orgBId },
    });
    expect(r.count).toBe(0);
    const after = await prisma.campaign.findUnique({ where: { id: ids.campaign } });
    expect(after).not.toBeNull();
  });
});
