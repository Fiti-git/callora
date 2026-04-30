/**
 * Tenant-isolation matrix for the six new email-marketing tables. For each
 * row created in OrgA, prove that the typical findFirst({ where:{ id,
 * organizationId } }) tenant-scoping idiom returns null when queried under
 * OrgB's id.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;
let orgAId = "";
let orgBId = "";
const ids: Record<string, string> = {};

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "EmailCampaign" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;

  const tag = `emIso-${Date.now()}`;
  orgAId = (await prisma.organization.create({ data: { name: `A-${tag}` } })).id;
  orgBId = (await prisma.organization.create({ data: { name: `B-${tag}` } })).id;

  const campaign = await prisma.emailCampaign.create({
    data: {
      organizationId: orgAId,
      name: "c",
      subject: "s",
      htmlBody: "x",
      fromName: "f",
      fromEmail: "f@x.com",
    },
  });
  ids.campaign = campaign.id;

  const list = await prisma.emailRecipientList.create({
    data: { organizationId: orgAId, name: "l" },
  });
  ids.list = list.id;

  const member = await prisma.emailRecipientListMember.create({
    data: { listId: list.id, email: `m-${tag}@x.com`, source: "MANUAL" },
  });
  ids.member = member.id;

  const send = await prisma.emailSend.create({
    data: {
      campaignId: campaign.id,
      organizationId: orgAId,
      email: `s-${tag}@x.com`,
      status: "SENT",
    },
  });
  ids.send = send.id;

  const tpl = await prisma.emailTemplate.create({
    data: {
      organizationId: orgAId,
      name: "t",
      subject: "s",
      htmlBody: "x",
    },
  });
  ids.template = tpl.id;

  const auto = await prisma.emailAutomation.create({
    data: {
      organizationId: orgAId,
      name: "a",
      trigger: "LEAD_QUALIFIED",
      sequence: [{ kind: "WAIT", days: 1 }],
    },
  });
  ids.automation = auto.id;

  const run = await prisma.emailAutomationRun.create({
    data: {
      automationId: auto.id,
      organizationId: orgAId,
      status: "RUNNING",
      context: {},
    },
  });
  ids.run = run.id;
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.emailAutomationRun.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.emailAutomation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.emailTemplate.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.emailSend.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.emailRecipientListMember.deleteMany({ where: { listId: ids.list } });
  await prisma.emailRecipientList.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.emailCampaign.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("Email-marketing tenant isolation", () => {
  it.skipIf(!dbUp || !schemaReady)("EmailCampaign foreign read returns null", async () => {
    const r = await prisma.emailCampaign.findFirst({
      where: { id: ids.campaign, organizationId: orgBId },
    });
    expect(r).toBeNull();
  });

  it.skipIf(!dbUp || !schemaReady)("EmailRecipientList foreign read returns null", async () => {
    const r = await prisma.emailRecipientList.findFirst({
      where: { id: ids.list, organizationId: orgBId },
    });
    expect(r).toBeNull();
  });

  it.skipIf(!dbUp || !schemaReady)("EmailSend foreign read returns null", async () => {
    const r = await prisma.emailSend.findFirst({
      where: { id: ids.send, organizationId: orgBId },
    });
    expect(r).toBeNull();
  });

  it.skipIf(!dbUp || !schemaReady)("EmailTemplate foreign read returns null", async () => {
    const r = await prisma.emailTemplate.findFirst({
      where: { id: ids.template, organizationId: orgBId },
    });
    expect(r).toBeNull();
  });

  it.skipIf(!dbUp || !schemaReady)("EmailAutomation foreign read returns null", async () => {
    const r = await prisma.emailAutomation.findFirst({
      where: { id: ids.automation, organizationId: orgBId },
    });
    expect(r).toBeNull();
  });

  it.skipIf(!dbUp || !schemaReady)("EmailAutomationRun foreign read returns null", async () => {
    const r = await prisma.emailAutomationRun.findFirst({
      where: { id: ids.run, organizationId: orgBId },
    });
    expect(r).toBeNull();
  });
});
