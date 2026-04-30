import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
let orgAId = "";
let orgBId = "";

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "EmailSuppression" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;
  const tag = `sup-${Date.now()}`;
  try {
    orgAId = (await prisma.organization.create({ data: { name: `A-${tag}` } })).id;
    orgBId = (await prisma.organization.create({ data: { name: `B-${tag}` } })).id;
  } catch (err) {
    console.warn("[email-suppression] org setup failed:", (err as any)?.message);
    schemaReady = false;
  }
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.emailSuppression.deleteMany({});
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await prisma.$disconnect();
});

describe("isSuppressed", () => {
  it.skipIf(!dbUp || !schemaReady)("returns false for an unknown email", async () => {
    const { isSuppressed } = await import("../lib/email.js");
    const r = await isSuppressed("nobody@example.com", orgAId);
    expect(r.suppressed).toBe(false);
  });

  it.skipIf(!dbUp || !schemaReady)("BOUNCED suppression is per-org", async () => {
    await prisma.emailSuppression.create({
      data: {
        email: "bounce@test.local",
        organizationId: orgAId,
        reason: "BOUNCED",
        source: "RESEND_WEBHOOK",
      },
    });
    const { isSuppressed } = await import("../lib/email.js");
    const a = await isSuppressed("bounce@test.local", orgAId);
    const b = await isSuppressed("bounce@test.local", orgBId);
    expect(a.suppressed).toBe(true);
    expect(a.reason).toBe("BOUNCED");
    expect(b.suppressed).toBe(false);
  });

  it.skipIf(!dbUp || !schemaReady)("COMPLAINED suppression is platform-wide", async () => {
    await prisma.emailSuppression.create({
      data: {
        email: "complaint@test.local",
        organizationId: null,
        reason: "COMPLAINED",
        source: "RESEND_WEBHOOK",
      },
    });
    const { isSuppressed } = await import("../lib/email.js");
    const a = await isSuppressed("complaint@test.local", orgAId);
    const b = await isSuppressed("complaint@test.local", orgBId);
    expect(a.suppressed).toBe(true);
    expect(b.suppressed).toBe(true);
  });

  it.skipIf(!dbUp || !schemaReady)("sendEmail short-circuits with status=SUPPRESSED for suppressed recipient", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import("../lib/email.js");

    await sendEmail("bounce@test.local", "subject", "<p>x</p>", {
      organizationId: orgAId,
      template: "test",
    });
    const row = await prisma.emailLog.findFirst({
      where: { recipient: "bounce@test.local", organizationId: orgAId },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.status).toBe("SUPPRESSED");
  });
});
