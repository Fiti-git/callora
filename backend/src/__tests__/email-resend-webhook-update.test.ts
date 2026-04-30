/**
 * Asserts the Resend webhook flips matching EmailSend rows + bumps the
 * campaign aggregate counters. Idempotent via the existing
 * ResendWebhookEvent table — second delivery of the same event id is a
 * no-op.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import express from "express";
import http from "node:http";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET = "test-resend-webhook-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;
let orgId = "";
let campaignId = "";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function postRaw(app: express.Express, body: string, headers: Record<string, string>) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/api/email/webhook/resend",
          headers: { "content-length": Buffer.byteLength(body), ...headers },
        },
        (resp) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c) => chunks.push(c));
          resp.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: any = text;
            try { parsed = JSON.parse(text); } catch { /* ignore */ }
            server.close();
            resolve({ status: resp.statusCode || 0, body: parsed });
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  });
}

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "EmailSend" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;
  const tag = `erw-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
  orgId = org.id;
  const campaign = await prisma.emailCampaign.create({
    data: {
      organizationId: orgId,
      name: "C",
      subject: "S",
      htmlBody: "x",
      fromName: "from",
      fromEmail: "from@x.com",
      status: "SENDING",
      totalSent: 1,
    },
  });
  campaignId = campaign.id;
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.emailSend.deleteMany({ where: { organizationId: orgId } });
  await prisma.emailCampaign.deleteMany({ where: { organizationId: orgId } });
  await prisma.emailLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.emailSuppression.deleteMany({});
  await prisma.resendWebhookEvent.deleteMany({});
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("Resend webhook → EmailSend + campaign totals", () => {
  it.skipIf(!dbUp || !schemaReady)("email.opened increments totalOpened + flips send status", async () => {
    const router = (await import("../routes/resendWebhook.js")).default;
    const app = express();
    app.use("/api/email", router);

    const recipient = `open-${Date.now()}@test.local`;
    const messageId = `msg_open_${Date.now()}`;
    const send = await prisma.emailSend.create({
      data: {
        campaignId,
        organizationId: orgId,
        email: recipient,
        status: "SENT",
        providerMessageId: messageId,
        sentAt: new Date(),
      },
    });

    const eventId = `evt_open_${Date.now()}`;
    const body = JSON.stringify({
      id: eventId,
      type: "email.opened",
      data: { to: recipient, email_id: messageId },
    });
    const sig = sign(body, process.env.RESEND_WEBHOOK_SECRET!);
    const r = await postRaw(app, body, {
      "content-type": "application/json",
      "resend-signature": sig,
    });
    expect(r.status).toBe(200);

    const updated = await prisma.emailSend.findUnique({ where: { id: send.id } });
    expect(updated?.openedAt).not.toBeNull();
    expect(updated?.status).toBe("OPENED");

    const camp = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
    expect(camp?.totalOpened).toBeGreaterThanOrEqual(1);

    // Second delivery → idempotent.
    const r2 = await postRaw(app, body, {
      "content-type": "application/json",
      "resend-signature": sig,
    });
    expect(r2.status).toBe(200);
    expect(r2.body?.idempotent).toBe(true);
  });
});
