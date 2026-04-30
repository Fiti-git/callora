import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 2 Agent 7 — contact / deal timeline.
 *
 * Asserts:
 *  - Events are interleaved + sorted desc.
 *  - Cross-org access returns null (route would 404).
 *  - EmailLog rows only join when recipient = contact.email AND org matches.
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
  const tag = `tl-${Date.now()}`;
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
    data: { name: `OrgA-${tag}`, users: { create: { email: `a-${tag}@t.local`, password: "x", role: "ADMIN" } } },
    include: { users: true },
  });
  const orgB = await prisma.organization.create({ data: { name: `OrgB-${tag}` } });
  orgAId = orgA.id;
  orgBId = orgB.id;
  userAId = orgA.users[0].id;
  campAId = (await prisma.campaign.create({ data: { name: `c-${tag}`, organizationId: orgAId } })).id;
});

afterAll(async () => {
  if (!dbUp) return;
  for (const orgId of [orgAId, orgBId]) {
    await prisma.dealHistory.deleteMany({ where: { organizationId: orgId } });
    await prisma.note.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.deal.deleteMany({ where: { organizationId: orgId } });
    await prisma.callLog.deleteMany({ where: { lead: { organizationId: orgId } } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.contact.deleteMany({ where: { organizationId: orgId } });
    await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
    await prisma.emailLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
  }
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("timeline", () => {
  it.skipIf(!dbUp)("cross-org contact lookup is null (route would 404)", async () => {
    const c = await prisma.contact.create({
      data: { businessName: "x", phone: `+155003${Math.random()}`.slice(0, 12), organizationId: orgAId },
    });
    const fromB = await prisma.contact.findFirst({ where: { id: c.id, organizationId: orgBId } });
    expect(fromB).toBeNull();
  });

  it.skipIf(!dbUp)("interleaves events sorted desc and filters EmailLog by recipient + org", async () => {
    const tag = `inter-${Date.now()}`;
    const email = `${tag}@example.com`;
    const contact = await prisma.contact.create({
      data: { businessName: tag, phone: `+1555${Math.random()}`.slice(0, 12), email, organizationId: orgAId },
    });
    const lead = await prisma.lead.create({
      data: { businessName: tag, phone: contact.phone, campaignId: campAId, organizationId: orgAId, contactId: contact.id },
    });
    // Three events spaced 1 sec apart.
    const t0 = new Date(Date.now() - 3000);
    const t1 = new Date(Date.now() - 2000);
    const t2 = new Date(Date.now() - 1000);
    const note = await prisma.note.create({
      data: { content: "n", type: "NOTE", contactId: contact.id, organizationId: orgAId, authorId: userAId, createdAt: t0 },
    });
    const call = await prisma.callLog.create({
      data: { leadId: lead.id, duration: 30, status: "COMPLETED", createdAt: t1 },
    });
    const sentEmail = await prisma.emailLog.create({
      data: { organizationId: orgAId, recipient: email, subject: "hi", status: "SENT", createdAt: t2 },
    });
    // EmailLog row that should NOT match (different recipient, same org).
    await prisma.emailLog.create({
      data: { organizationId: orgAId, recipient: "other@example.com", subject: "no", status: "SENT" },
    });
    // EmailLog row that should NOT match (same recipient, different org).
    await prisma.emailLog.create({
      data: { organizationId: orgBId, recipient: email, subject: "wrong-org", status: "SENT" },
    });

    const c = await prisma.contact.findFirst({
      where: { id: contact.id, organizationId: orgAId },
      include: { leads: { select: { id: true } }, deals: { select: { id: true } } },
    });
    expect(c).not.toBeNull();

    const { collectContactTimeline } = await import("../routes/contacts.js");
    const events = await collectContactTimeline(c as any, orgAId, null, 50);
    // Three events: NOTE, CALL, EMAIL_SENT (the cross-org / wrong-recipient
    // EmailLog rows must be excluded).
    const types = events.map((e) => e.type);
    expect(types).toContain("NOTE");
    expect(types).toContain("CALL");
    expect(types).toContain("EMAIL_SENT");
    expect(events.filter((e) => e.type === "EMAIL_SENT").length).toBe(1);
    // Sorted desc by .at.
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].at.getTime()).toBeGreaterThanOrEqual(events[i].at.getTime());
    }
    // Reference variables to satisfy strict TS in tests.
    expect(note.id).toBeTruthy();
    expect(call.id).toBeTruthy();
    expect(sentEmail.id).toBeTruthy();
  });
});
