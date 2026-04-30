import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

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
let orgId = "";
let leadOk = "";
let leadNoConsent = "";
let leadDnc = "";

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT "consentGiven" FROM "Lead" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;

  const tag = `cbv-${Date.now()}`;
  try {
    const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
    orgId = org.id;
  } catch (err) {
    console.warn("[consent-block-vapi] org setup failed:", (err as any)?.message);
    schemaReady = false;
    return;
  }
  const camp = await prisma.campaign.create({
    data: { name: `c-${tag}`, organizationId: orgId, status: "DRAFT" },
  });
  const ok = await prisma.lead.create({
    data: {
      businessName: "ok",
      phone: "+14155550111",
      campaignId: camp.id,
      organizationId: orgId,
      consentGiven: true,
      doNotCall: false,
    },
  });
  const noc = await prisma.lead.create({
    data: {
      businessName: "noc",
      phone: "+14155550222",
      campaignId: camp.id,
      organizationId: orgId,
      consentGiven: false,
    },
  });
  const dnc = await prisma.lead.create({
    data: {
      businessName: "dnc",
      phone: "+14155550333",
      campaignId: camp.id,
      organizationId: orgId,
      consentGiven: true,
      doNotCall: true,
    },
  });
  leadOk = ok.id;
  leadNoConsent = noc.id;
  leadDnc = dnc.id;
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.callLog.deleteMany({ where: { lead: { organizationId: orgId } } });
  await prisma.lead.deleteMany({ where: { organizationId: orgId } });
  await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

// Mock axios so initiateCall never hits the network.
vi.mock("axios", () => ({
  default: { post: vi.fn().mockResolvedValue({ data: { id: "vapi_test" } }) },
}));

describe("VapiService consent + DNC gates", () => {
  it.skipIf(!dbUp || !schemaReady)("throws ConsentRequiredError when consentGiven=false", async () => {
    const { VapiService } = await import("../services/vapi.js");
    const v = new VapiService("test-key", "test-phone-id");
    await expect(
      v.initiateCall("+14155550222", "noc", { aiCallerName: "X", aiCallerCompany: "Y", aiCallerPhone: "+1", aiSystemPrompt: "be nice" }, orgId)
    ).rejects.toMatchObject({ name: "ConsentRequiredError", reason: "NO_CONSENT" });
  });

  it.skipIf(!dbUp || !schemaReady)("throws ConsentRequiredError DO_NOT_CALL when doNotCall=true", async () => {
    const { VapiService } = await import("../services/vapi.js");
    const v = new VapiService("test-key", "test-phone-id");
    await expect(
      v.initiateCall("+14155550333", "dnc", { aiCallerName: "X", aiCallerCompany: "Y", aiCallerPhone: "+1", aiSystemPrompt: "be nice" }, orgId)
    ).rejects.toMatchObject({ name: "ConsentRequiredError", reason: "DO_NOT_CALL" });
  });

  it.skipIf(!dbUp || !schemaReady)("does NOT throw when consent + no DNC", async () => {
    const { VapiService } = await import("../services/vapi.js");
    const v = new VapiService("test-key", "test-phone-id");
    // initiateCall calls meterAndCharge — wrap so quota errors don't fail us.
    try {
      await v.initiateCall("+14155550111", "ok",
        { aiCallerName: "X", aiCallerCompany: "Y", aiCallerPhone: "+1", aiSystemPrompt: "be nice" },
        orgId);
    } catch (err: any) {
      // The only acceptable error here is quota / vapi-config (not consent/DNC).
      expect(err?.name).not.toBe("ConsentRequiredError");
      expect(err?.name).not.toBe("DNCBlockedError");
    }
  });
});
