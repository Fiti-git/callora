import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
// Force the Resend short-circuit so we don't actually hit the network.
delete process.env.RESEND_API_KEY;

/**
 * Phase 1 wrap-up Task 3: sendEmail meters tenant-bound sends against the
 * org's monthly EMAIL quota. Required mails throw, passive mails log
 * QUOTA_EXCEEDED and return silently.
 *
 * Skip-if-no-DB pattern, matching email-log.test.ts.
 */

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

async function makeOrgWithEmailLimit(emailLimit: number): Promise<{ orgId: string; planId: string }> {
  const tag = `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const plan = await prisma.plan.create({
    data: {
      tier: "ENTERPRISE",
      name: `Plan-${tag}`,
      stripePriceId: `price_${tag}`,
      monthlyCallQuota: 1_000_000,
      monthlyLeadQuota: 1_000_000,
      seatLimit: 100,
      priceCents: 0,
      maxEmailsPerMonth: emailLimit,
    },
  });
  const org = await prisma.organization.create({
    data: { name: `Org-${tag}` },
  });
  await prisma.subscription.create({
    data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
  });
  return { orgId: org.id, planId: plan.id };
}

async function teardown(orgId: string, planId: string) {
  try {
    await prisma.emailLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.usageRecord.deleteMany({ where: { organizationId: orgId } });
    await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.plan.delete({ where: { id: planId } });
  } catch {
    /* best effort */
  }
}

describe("sendEmail EMAIL quota wrapping", () => {
  it.skipIf(!dbUp || !schemaReady)(
    "under-limit + tenant-bound: meter increments and email is attempted",
    async () => {
      const { orgId, planId } = await makeOrgWithEmailLimit(5);
      try {
        const { sendEmail } = await import("../lib/email.js");
        await sendEmail("u@example.com", "hello", "<p>hi</p>", {
          organizationId: orgId,
          template: "welcome",
          required: false,
        });
        const usage = await prisma.usageRecord.findFirst({
          where: { organizationId: orgId },
        });
        expect(usage?.emailsSent).toBe(1);
        const log = await prisma.emailLog.findFirst({
          where: { organizationId: orgId, recipient: "u@example.com" },
          orderBy: { createdAt: "desc" },
        });
        expect(log).not.toBeNull();
        // RESEND_API_KEY is unset → status FAILED with the well-known error.
        expect(log!.status).toBe("FAILED");
        expect(log!.error).toMatch(/RESEND_API_KEY/);
      } finally {
        await teardown(orgId, planId);
      }
    }
  );

  it.skipIf(!dbUp || !schemaReady)(
    "at-limit + required=true → throws QuotaExceededError, no email send, EmailLog records QUOTA_EXCEEDED",
    async () => {
      const { orgId, planId } = await makeOrgWithEmailLimit(1);
      try {
        // Pre-fill usage to exactly the limit.
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await prisma.usageRecord.create({
          data: {
            organizationId: orgId,
            periodStart: start,
            periodEnd: end,
            emailsSent: 1,
          },
        });

        const { sendEmail } = await import("../lib/email.js");
        await expect(
          sendEmail("u@example.com", "reset", "<p>reset</p>", {
            organizationId: orgId,
            template: "passwordReset",
            required: true,
          })
        ).rejects.toMatchObject({ name: "QuotaExceededError" });

        // The EmailLog row should still be present with status=QUOTA_EXCEEDED.
        const log = await prisma.emailLog.findFirst({
          where: { organizationId: orgId, status: "QUOTA_EXCEEDED" },
          orderBy: { createdAt: "desc" },
        });
        expect(log).not.toBeNull();
        expect(log!.template).toBe("passwordReset");
      } finally {
        await teardown(orgId, planId);
      }
    }
  );

  it.skipIf(!dbUp || !schemaReady)(
    "at-limit + required=false → returns silently, EmailLog row has status QUOTA_EXCEEDED",
    async () => {
      const { orgId, planId } = await makeOrgWithEmailLimit(1);
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await prisma.usageRecord.create({
          data: {
            organizationId: orgId,
            periodStart: start,
            periodEnd: end,
            emailsSent: 1,
          },
        });

        const { sendEmail } = await import("../lib/email.js");
        await expect(
          sendEmail("u@example.com", "ping", "<p>ping</p>", {
            organizationId: orgId,
            template: "qualifiedLead",
            required: false,
          })
        ).resolves.toBeUndefined();

        const log = await prisma.emailLog.findFirst({
          where: { organizationId: orgId, status: "QUOTA_EXCEEDED" },
          orderBy: { createdAt: "desc" },
        });
        expect(log).not.toBeNull();
        expect(log!.template).toBe("qualifiedLead");
      } finally {
        await teardown(orgId, planId);
      }
    }
  );

  it.skipIf(!dbUp || !schemaReady)(
    "platform email (no organizationId) skips the meter entirely",
    async () => {
      const { sendEmail } = await import("../lib/email.js");
      const before = await prisma.emailLog.count({
        where: { organizationId: null, recipient: "platform@example.com" },
      });
      await sendEmail("platform@example.com", "alert", "<p>alert</p>", {
        template: "platformAlert",
      });
      const after = await prisma.emailLog.count({
        where: { organizationId: null, recipient: "platform@example.com" },
      });
      expect(after).toBe(before + 1);
      const log = await prisma.emailLog.findFirst({
        where: { organizationId: null, recipient: "platform@example.com" },
        orderBy: { createdAt: "desc" },
      });
      expect(log!.status).not.toBe("QUOTA_EXCEEDED");
      // Cleanup
      if (log) await prisma.emailLog.delete({ where: { id: log.id } });
    }
  );
});
