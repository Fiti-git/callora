/**
 * emitTenantEvent — Phase 3 Agent 12.
 *
 * Verifies that emitTenantEvent finds active subscribed webhooks, creates
 * delivery rows, and enqueues jobs. Inactive / wrong-event webhooks must
 * be skipped.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-webhook";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "TenantWebhook" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("emitTenantEvent", () => {
  it.skipIf(!dbUp || !schemaReady)("creates delivery rows for active subscribed webhooks only", async () => {
    // Stub the queue to avoid Redis dependency.
    const queueMod = await import("../lib/queue.js");
    const addSpy = vi.spyOn(queueMod.tenantWebhookQueue, "add").mockResolvedValue({ id: "stub" } as any);

    const tag = `whEmit-${Date.now()}`;
    const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });

    const matching = await prisma.tenantWebhook.create({
      data: {
        organizationId: org.id,
        url: "https://example.com/hook",
        events: ["LEAD_QUALIFIED"] as any,
        secret: "s1",
        active: true,
      },
    });
    const inactive = await prisma.tenantWebhook.create({
      data: {
        organizationId: org.id,
        url: "https://example.com/hook2",
        events: ["LEAD_QUALIFIED"] as any,
        secret: "s2",
        active: false,
      },
    });
    const wrongEvent = await prisma.tenantWebhook.create({
      data: {
        organizationId: org.id,
        url: "https://example.com/hook3",
        events: ["DEAL_WON"] as any,
        secret: "s3",
        active: true,
      },
    });

    const { emitTenantEvent } = await import("../lib/webhookEmit.js");
    const r = await emitTenantEvent(org.id, "LEAD_QUALIFIED", { leadId: "abc" });
    expect(r.delivered).toBe(1);

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { organizationId: org.id },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].webhookId).toBe(matching.id);
    expect(deliveries[0].status).toBe("PENDING");
    expect(addSpy).toHaveBeenCalledTimes(1);

    // Cleanup
    await prisma.webhookDelivery.deleteMany({ where: { organizationId: org.id } });
    await prisma.tenantWebhook.deleteMany({
      where: { id: { in: [matching.id, inactive.id, wrongEvent.id] } },
    });
    await prisma.organization.delete({ where: { id: org.id } });
    addSpy.mockRestore();
  });
});
