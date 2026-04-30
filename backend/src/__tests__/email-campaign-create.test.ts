/**
 * DB-gated route smoke test for email campaigns. Asserts:
 *  - create returns 201 + DRAFT
 *  - PATCH on SENDING returns 409
 *  - DELETE on SENT returns 409 (preserve audit)
 *
 * Skips automatically when DATABASE_URL is unreachable.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-webhook-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;
let orgId = "";
let userId = "";
let token = "";

async function call(
  app: express.Express,
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const headers: Record<string, string | number> = {
        Authorization: `Bearer ${token}`,
      };
      if (data) {
        headers["content-type"] = "application/json";
        headers["content-length"] = Buffer.byteLength(data);
      }
      const req = http.request(
        { host: "127.0.0.1", port, method, path, headers },
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
      if (data) req.write(data);
      req.end();
    });
  });
}

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "EmailCampaign" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;

  const tag = `ec-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
  orgId = org.id;
  const user = await prisma.user.create({
    data: { email: `u-${tag}@x.com`, password: "x", organizationId: orgId, role: "ADMIN" },
  });
  userId = user.id;
  token = jwt.sign(
    { userId, organizationId: orgId, email: user.email, role: "ADMIN", tokenVersion: 0 },
    process.env.NEXTAUTH_SECRET!
  );
});

afterAll(async () => {
  if (!dbUp || !schemaReady) {
    await prisma.$disconnect();
    return;
  }
  await prisma.emailCampaign.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("Email campaign route status guards", () => {
  it.skipIf(!dbUp || !schemaReady)("creates a DRAFT campaign", async () => {
    const router = (await import("../routes/emailMarketing.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/email-marketing", router);

    const r = await call(app, "POST", "/api/email-marketing/campaigns", {
      name: "Test",
      subject: "Hello",
      htmlBody: "<p>Hi</p>",
      fromName: "Sender",
      fromEmail: "send@example.com",
      listIds: [],
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("DRAFT");
  });

  it.skipIf(!dbUp || !schemaReady)("PATCH on SENDING returns 409", async () => {
    const c = await prisma.emailCampaign.create({
      data: {
        organizationId: orgId,
        name: "Sending",
        subject: "x",
        htmlBody: "x",
        fromName: "x",
        fromEmail: "x@x.com",
        status: "SENDING",
      },
    });
    const router = (await import("../routes/emailMarketing.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/email-marketing", router);

    const r = await call(app, "PATCH", `/api/email-marketing/campaigns/${c.id}`, {
      name: "renamed",
    });
    expect(r.status).toBe(409);
  });

  it.skipIf(!dbUp || !schemaReady)("DELETE on SENT returns 409", async () => {
    const c = await prisma.emailCampaign.create({
      data: {
        organizationId: orgId,
        name: "Sent",
        subject: "x",
        htmlBody: "x",
        fromName: "x",
        fromEmail: "x@x.com",
        status: "SENT",
      },
    });
    const router = (await import("../routes/emailMarketing.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/email-marketing", router);

    const r = await call(app, "DELETE", `/api/email-marketing/campaigns/${c.id}`);
    expect(r.status).toBe(409);
  });
});
