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

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function postRaw(app: express.Express, path: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path,
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
    await prisma.$queryRawUnsafe('SELECT 1 FROM "ResendWebhookEvent" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;
  const tag = `rwh-${Date.now()}`;
  try {
    orgId = (await prisma.organization.create({ data: { name: `Org-${tag}` } })).id;
  } catch (err) {
    console.warn("[resend-webhook] org setup failed:", (err as any)?.message);
    schemaReady = false;
  }
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.emailLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.emailSuppression.deleteMany({});
  await prisma.resendWebhookEvent.deleteMany({});
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("Resend webhook", () => {
  it.skipIf(!dbUp || !schemaReady)("rejects events with bad signature (400)", async () => {
    const router = (await import("../routes/resendWebhook.js")).default;
    const app = express();
    app.use("/api/email", router);

    const body = JSON.stringify({ id: `evt_${Date.now()}`, type: "email.bounced", data: { to: "x@y.com" } });
    const r = await postRaw(app, "/api/email/webhook/resend", body, {
      "content-type": "application/json",
      "resend-signature": "deadbeef",
    });
    expect(r.status).toBe(400);
  });

  it.skipIf(!dbUp || !schemaReady)("bounce → suppression + EmailLog status=BOUNCED", async () => {
    const router = (await import("../routes/resendWebhook.js")).default;
    const app = express();
    app.use("/api/email", router);

    const recipient = `bounce-${Date.now()}@test.local`;
    const log = await prisma.emailLog.create({
      data: {
        organizationId: orgId,
        recipient,
        subject: "x",
        status: "SENT",
        providerMessageId: `msg_${Date.now()}`,
      },
    });
    const eventId = `evt_b_${Date.now()}`;
    const body = JSON.stringify({
      id: eventId,
      type: "email.bounced",
      data: { to: recipient, email_id: log.providerMessageId },
    });
    const sig = sign(body, process.env.RESEND_WEBHOOK_SECRET!);
    const r = await postRaw(app, "/api/email/webhook/resend", body, {
      "content-type": "application/json",
      "resend-signature": sig,
    });
    expect(r.status).toBe(200);

    const sup = await prisma.emailSuppression.findFirst({
      where: { email: recipient.toLowerCase() },
    });
    expect(sup?.reason).toBe("BOUNCED");

    const updated = await prisma.emailLog.findUnique({ where: { id: log.id } });
    expect(updated?.status).toBe("BOUNCED");
  });

  it.skipIf(!dbUp || !schemaReady)("idempotent: same event id → 200 with idempotent flag", async () => {
    const router = (await import("../routes/resendWebhook.js")).default;
    const app = express();
    app.use("/api/email", router);

    const recipient = `dup-${Date.now()}@test.local`;
    const eventId = `evt_dup_${Date.now()}`;
    const body = JSON.stringify({
      id: eventId,
      type: "email.bounced",
      data: { to: recipient },
    });
    const sig = sign(body, process.env.RESEND_WEBHOOK_SECRET!);
    const headers = { "content-type": "application/json", "resend-signature": sig };
    const r1 = await postRaw(app, "/api/email/webhook/resend", body, headers);
    const r2 = await postRaw(app, "/api/email/webhook/resend", body, headers);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body?.idempotent).toBe(true);
  });
});
