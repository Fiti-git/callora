/**
 * webhookDeliveryWorker — Phase 3 Agent 12.
 *
 * Mocks global fetch to inspect signature header + status-driven branching.
 * 2xx → SUCCESS. 4xx-non-429 → FAILED no retry. 5xx → throws (retry).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
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

async function setupWebhookDelivery(secret: string, payload: any) {
  const tag = `wd-${Date.now()}-${Math.random()}`;
  const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
  const wh = await prisma.tenantWebhook.create({
    data: {
      organizationId: org.id,
      url: "https://example.test/hook",
      events: ["LEAD_QUALIFIED"] as any,
      secret,
      active: true,
    },
  });
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId: wh.id,
      organizationId: org.id,
      event: "LEAD_QUALIFIED" as any,
      payload,
      status: "PENDING",
    },
  });
  return { org, wh, delivery };
}

async function cleanup(orgId: string) {
  await prisma.webhookDelivery.deleteMany({ where: { organizationId: orgId } });
  await prisma.tenantWebhook.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
}

describe("webhookDeliveryWorker", () => {
  it.skipIf(!dbUp || !schemaReady)("2xx → SUCCESS; signature is HMAC of body", async () => {
    const secret = "shh-this-is-the-secret";
    const payload = { event: "LEAD_QUALIFIED", leadId: "L1" };
    const { org, delivery } = await setupWebhookDelivery(secret, payload);

    let receivedHeaders: Record<string, string> | null = null;
    let receivedBody: string | null = null;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      receivedHeaders = init?.headers as Record<string, string>;
      receivedBody = init?.body as string;
      return new Response("ok", { status: 200 }) as any;
    });

    const { webhookDeliveryWorker } = await import("../workers/webhookDeliveryWorker.js");
    const job: any = { data: { deliveryId: delivery.id }, opts: { attempts: 3 } };
    const r = await webhookDeliveryWorker(job);
    expect(r.status).toBe("SUCCESS");

    const updated = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
    expect(updated?.status).toBe("SUCCESS");
    expect(updated?.responseCode).toBe(200);
    expect(updated?.attempts).toBe(1);

    // Verify HMAC signature.
    const expectedSig = crypto.createHmac("sha256", secret).update(receivedBody!).digest("hex");
    expect(receivedHeaders!["x-callora-signature"]).toBe(`sha256=${expectedSig}`);
    expect(receivedHeaders!["x-callora-event"]).toBe("LEAD_QUALIFIED");

    fetchSpy.mockRestore();
    await cleanup(org.id);
  });

  it.skipIf(!dbUp || !schemaReady)("400 → FAILED (terminal, no retry)", async () => {
    const { org, delivery } = await setupWebhookDelivery("s", { x: 1 });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("bad", { status: 400 }) as any);
    const { webhookDeliveryWorker } = await import("../workers/webhookDeliveryWorker.js");
    const r = await webhookDeliveryWorker({ data: { deliveryId: delivery.id }, opts: { attempts: 3 } } as any);
    expect(r.status).toBe("FAILED");
    const updated = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
    expect(updated?.status).toBe("FAILED");
    expect(updated?.responseCode).toBe(400);
    fetchSpy.mockRestore();
    await cleanup(org.id);
  });

  it.skipIf(!dbUp || !schemaReady)("500 → throws (retry); 3rd attempt → FAILED", async () => {
    const { org, delivery } = await setupWebhookDelivery("s", { x: 1 });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("oops", { status: 500 }) as any);
    const { webhookDeliveryWorker } = await import("../workers/webhookDeliveryWorker.js");

    // Attempt 1 — should throw (retrying).
    await expect(
      webhookDeliveryWorker({ data: { deliveryId: delivery.id }, opts: { attempts: 3 } } as any)
    ).rejects.toThrow();
    let row = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
    expect(row?.status).toBe("RETRYING");
    expect(row?.attempts).toBe(1);

    // Attempt 3 (final) — should mark FAILED rather than throw.
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { attempts: 2 } });
    await expect(
      webhookDeliveryWorker({ data: { deliveryId: delivery.id }, opts: { attempts: 3 } } as any)
    ).resolves.toBeDefined();
    row = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
    expect(row?.status).toBe("FAILED");

    fetchSpy.mockRestore();
    await cleanup(org.id);
  });
});
