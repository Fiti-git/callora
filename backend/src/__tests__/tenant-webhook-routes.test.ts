/**
 * Tenant webhook CRUD routes — Phase 3 Agent 12.
 *
 * Verifies the secret-disclosure contract: returned at create + rotate ONCE,
 * never in subsequent GET responses.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-webhook";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;
let token = "";
let orgId = "";
let userId = "";

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "TenantWebhook" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;
  const tag = `whR-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
  orgId = org.id;
  const u = await prisma.user.create({
    data: {
      email: `u-${tag}@x.com`,
      password: await bcrypt.hash("x", 4),
      role: "ADMIN",
      organizationId: org.id,
      emailVerified: true,
    },
  });
  userId = u.id;
  token = jwt.sign(
    { userId: u.id, organizationId: org.id, email: u.email, role: u.role, tokenVersion: 0 },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
  if (orgId) {
    await prisma.webhookDelivery.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.tenantWebhook.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { actorId: userId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

async function req(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const queue = await import("../lib/queue.js");
  vi.spyOn(queue.tenantWebhookQueue, "add").mockResolvedValue({ id: "stub" } as any);
  const mod = await import("../routes/webhooks.js");
  const app = express();
  app.use(express.json());
  app.use("/api/webhooks", mod.default);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const data = body ? JSON.stringify(body) : "";
      const r = http.request(
        {
          host: "127.0.0.1",
          port,
          method,
          path,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(data),
            authorization: `Bearer ${token}`,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: any = text;
            try { parsed = JSON.parse(text); } catch {}
            server.close();
            resolve({ status: res.statusCode || 0, body: parsed });
          });
        }
      );
      r.on("error", (e) => { server.close(); reject(e); });
      if (data) r.write(data);
      r.end();
    });
  });
}

describe("tenant webhook routes — secret disclosure", () => {
  it.skipIf(!dbUp || !schemaReady)("create returns secret; subsequent GET hides it; rotate returns new", async () => {
    const created = await req("POST", "/api/webhooks", {
      url: "https://example.com/hook",
      events: ["LEAD_QUALIFIED"],
    });
    expect(created.status).toBe(201);
    expect(created.body.secret).toBeTruthy();
    const id = created.body.id;
    const firstSecret = created.body.secret;

    const list = await req("GET", "/api/webhooks");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const fromList = list.body.find((w: any) => w.id === id);
    expect(fromList).toBeTruthy();
    expect(fromList.secret).toBeUndefined();

    const detail = await req("GET", `/api/webhooks/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.secret).toBeUndefined();

    const rot = await req("POST", `/api/webhooks/${id}/regenerate-secret`);
    expect(rot.status).toBe(200);
    expect(rot.body.secret).toBeTruthy();
    expect(rot.body.secret).not.toBe(firstSecret);

    const del = await req("DELETE", `/api/webhooks/${id}`);
    expect(del.status).toBe(204);
  });
});
