import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper-dnc";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;
let orgAId = "";
let orgBId = "";

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "DNCEntry" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;

  const tag = `dnc-${Date.now()}`;
  try {
    orgAId = (await prisma.organization.create({ data: { name: `A-${tag}` } })).id;
    orgBId = (await prisma.organization.create({ data: { name: `B-${tag}` } })).id;
  } catch (err) {
    console.warn("[dnc.test] org setup failed — schema drift; skipping suite:", (err as any)?.message);
    schemaReady = false;
  }
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.dNCEntry.deleteMany({ where: { OR: [{ organizationId: orgAId }, { organizationId: orgBId }] } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("DNC list semantics", () => {
  it.skipIf(!dbUp || !schemaReady)("isOnDNC returns true for tenant's own entry, false for other tenant", async () => {
    const { hashPhone, normalizeE164 } = await import("../lib/phone.js");
    const { isOnDNC } = await import("../lib/dnc.js");

    const e164 = normalizeE164("4155557777");
    await prisma.dNCEntry.create({
      data: {
        phoneHash: hashPhone(e164),
        organizationId: orgAId,
        source: "TENANT_UPLOAD",
      },
    });

    const a = await isOnDNC(e164, orgAId);
    const b = await isOnDNC(e164, orgBId);
    expect(a.onDnc).toBe(true);
    expect(b.onDnc).toBe(false);
  });

  it.skipIf(!dbUp || !schemaReady)("platform-wide DNC blocks all tenants", async () => {
    const { hashPhone, normalizeE164 } = await import("../lib/phone.js");
    const { isOnDNC } = await import("../lib/dnc.js");

    const e164 = normalizeE164("4155558888");
    await prisma.dNCEntry.create({
      data: {
        phoneHash: hashPhone(e164),
        organizationId: null,
        source: "TCPA_FEDERAL",
      },
    });

    const a = await isOnDNC(e164, orgAId);
    const b = await isOnDNC(e164, orgBId);
    expect(a.onDnc).toBe(true);
    expect(b.onDnc).toBe(true);
    expect(a.source).toBe("TCPA_FEDERAL");
  });

  it.skipIf(!dbUp || !schemaReady)("createMany skipDuplicates dedupes on (phoneHash, orgId)", async () => {
    const { hashPhone, normalizeE164 } = await import("../lib/phone.js");
    const e164 = normalizeE164("4155559999");
    const phoneHash = hashPhone(e164);

    const r1 = await prisma.dNCEntry.createMany({
      data: [{ phoneHash, organizationId: orgAId, source: "TENANT_UPLOAD" }],
      skipDuplicates: true,
    });
    const r2 = await prisma.dNCEntry.createMany({
      data: [{ phoneHash, organizationId: orgAId, source: "TENANT_UPLOAD" }],
      skipDuplicates: true,
    });
    expect(r1.count).toBe(1);
    expect(r2.count).toBe(0);
  });
});

describe("phone helpers", () => {
  it("normalizeE164 handles 10-digit US numbers", async () => {
    const { normalizeE164 } = await import("../lib/phone.js");
    expect(normalizeE164("4155551234")).toBe("+14155551234");
  });
  it("normalizeE164 preserves +-prefixed input", async () => {
    const { normalizeE164 } = await import("../lib/phone.js");
    expect(normalizeE164("+14155551234")).toBe("+14155551234");
  });
  it("hashPhone is deterministic for the same input", async () => {
    const { hashPhone } = await import("../lib/phone.js");
    expect(hashPhone("+14155551234")).toBe(hashPhone("+14155551234"));
  });
  it("hashPhone differs for different inputs", async () => {
    const { hashPhone } = await import("../lib/phone.js");
    expect(hashPhone("+14155551234")).not.toBe(hashPhone("+14155551235"));
  });
});
