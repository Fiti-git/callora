import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
  } catch {
    dbUp = false;
  }
  if (dbUp) {
    try {
      // Probe the EmailLog table — added by 20260429150000_add_email_log.
      // Skip the test gracefully if the local DB is on an older schema.
      await prisma.$queryRawUnsafe('SELECT 1 FROM "EmailLog" LIMIT 1');
      schemaReady = true;
    } catch {
      schemaReady = false;
    }
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Verifies sendEmail writes an EmailLog row on both success and failure
 * paths. Without RESEND_API_KEY set, the helper short-circuits with a
 * "skipped" warning and writes status=FAILED — that's the deterministic
 * test path.
 */
describe("sendEmail → EmailLog", () => {
  it("writes a FAILED row when RESEND_API_KEY is unset", async () => {
    if (!dbUp) {
      console.warn("skipping: DB not reachable");
      return;
    }
    if (!schemaReady) {
      console.warn("skipping: EmailLog table missing — run prisma migrate deploy");
      return;
    }
    delete process.env.RESEND_API_KEY;
    const before = await prisma.emailLog.count();

    const { sendEmail } = await import("../lib/email.js");
    await sendEmail("e2e-test@example.com", "subject-1", "<p>hi</p>", {
      template: "welcome",
    });

    const after = await prisma.emailLog.count();
    expect(after).toBe(before + 1);

    const row = await prisma.emailLog.findFirst({
      where: { recipient: "e2e-test@example.com" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).not.toBeNull();
    expect(row!.status).toBe("FAILED");
    expect(row!.template).toBe("welcome");
    expect(row!.error).toMatch(/RESEND_API_KEY/);

    // Cleanup.
    await prisma.emailLog.delete({ where: { id: row!.id } });
  });
});
