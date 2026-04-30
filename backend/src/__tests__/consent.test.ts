import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;
let orgAId = "";
let orgBId = "";
let userAId = "";
let leadAId = "";
let leadBId = "";

async function makeOrg(tag: string) {
  const pwHash = await bcrypt.hash("pw", 10);
  const org = await prisma.organization.create({
    data: {
      name: `Org-${tag}`,
      users: {
        create: { email: `u-${tag}@test.local`, password: pwHash, role: "ADMIN" },
      },
    },
    include: { users: true },
  });
  return org;
}

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe(
      'SELECT "consentGiven", "doNotCall", "state" FROM "Lead" LIMIT 1'
    ).catch(() => { throw new Error("schema not ready"); });
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;

  const tag = `consent-${Date.now()}`;
  try {
    const a = await makeOrg(`A-${tag}`);
    const b = await makeOrg(`B-${tag}`);
    orgAId = a.id;
    orgBId = b.id;
    userAId = a.users[0].id;
  } catch (err) {
    console.warn("[consent.test] org setup failed — skipping:", (err as any)?.message);
    schemaReady = false;
    return;
  }

  const camp = await prisma.campaign.create({
    data: { name: `c-${tag}`, organizationId: orgAId, status: "DRAFT" },
  });
  const leadA = await prisma.lead.create({
    data: { businessName: "biz-A", phone: "+14155550101", campaignId: camp.id, organizationId: orgAId },
  });
  leadAId = leadA.id;

  const campB = await prisma.campaign.create({
    data: { name: `c-b-${tag}`, organizationId: orgBId, status: "DRAFT" },
  });
  const leadB = await prisma.lead.create({
    data: { businessName: "biz-B", phone: "+14155550202", campaignId: campB.id, organizationId: orgBId },
  });
  leadBId = leadB.id;
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.callLog.deleteMany({ where: { lead: { organizationId: { in: [orgAId, orgBId] } } } });
  await prisma.lead.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.campaign.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("consent + do-not-call (logic)", () => {
  it.skipIf(!dbUp || !schemaReady)("default lead has consentGiven=false, doNotCall=false", async () => {
    const lead = await prisma.lead.findUnique({ where: { id: leadAId } });
    expect(lead?.consentGiven).toBe(false);
    expect(lead?.doNotCall).toBe(false);
  });

  it.skipIf(!dbUp || !schemaReady)("granting consent stamps timestamp + source", async () => {
    await prisma.lead.update({
      where: { id: leadAId },
      data: {
        consentGiven: true,
        consentTimestamp: new Date(),
        consentSource: "WEB_FORM",
        consentIpAddress: "1.2.3.4",
      },
    });
    const lead = await prisma.lead.findUnique({ where: { id: leadAId } });
    expect(lead?.consentGiven).toBe(true);
    expect(lead?.consentSource).toBe("WEB_FORM");
    expect(lead?.consentIpAddress).toBe("1.2.3.4");
  });

  it.skipIf(!dbUp || !schemaReady)("bulk-consent updates only the requesting org's leads", async () => {
    // Simulate the bulk endpoint's updateMany scoping.
    const result = await prisma.lead.updateMany({
      where: { id: { in: [leadAId, leadBId] }, organizationId: orgAId },
      data: { consentGiven: true, consentTimestamp: new Date(), consentSource: "MANUAL" },
    });
    expect(result.count).toBe(1); // only Org A's lead matched

    const a = await prisma.lead.findUnique({ where: { id: leadAId } });
    const b = await prisma.lead.findUnique({ where: { id: leadBId } });
    expect(a?.consentGiven).toBe(true);
    expect(b?.consentGiven).toBe(false); // Org B untouched
  });

  it.skipIf(!dbUp || !schemaReady)("do-not-call sets reason + timestamp", async () => {
    await prisma.lead.update({
      where: { id: leadAId },
      data: { doNotCall: true, doNotCallReason: "user opt-out", doNotCallAt: new Date() },
    });
    const lead = await prisma.lead.findUnique({ where: { id: leadAId } });
    expect(lead?.doNotCall).toBe(true);
    expect(lead?.doNotCallReason).toBe("user opt-out");
  });
});
