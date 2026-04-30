/**
 * Public API key CRUD — Phase 3 Agent 12.
 *
 * Verifies create returns raw ONCE, list shows masked prefix, delete sets
 * revokedAt (soft-revoke).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
    await prisma.$queryRawUnsafe('SELECT 1 FROM "PublicApiKey" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp || !schemaReady) return;
  const tag = `pakC-${Date.now()}`;
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
    await prisma.publicApiKey.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { actorId: userId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

async function call(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const mod = await import("../routes/developerKeys.js");
  const app = express();
  app.use(express.json());
  app.use("/api/developer", mod.default);
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

describe("publicApiKey CRUD", () => {
  it.skipIf(!dbUp || !schemaReady)("create returns raw ONCE, list shows prefix only, delete soft-revokes", async () => {
    const c = await call("POST", "/api/developer/api-keys", { name: "test-key", scopes: ["read"] });
    expect(c.status).toBe(201);
    expect(c.body.key).toMatch(/^cal_/);
    expect(c.body.prefix).toMatch(/^cal_/);
    const id = c.body.id;
    const raw = c.body.key;

    const list = await call("GET", "/api/developer/api-keys");
    expect(list.status).toBe(200);
    const found = list.body.find((k: any) => k.id === id);
    expect(found).toBeTruthy();
    // Raw key never re-returned.
    expect(found.key).toBeUndefined();
    expect(found.maskedKey).toContain("…");
    expect(raw.startsWith(found.prefix)).toBe(true);

    const del = await call("DELETE", `/api/developer/api-keys/${id}`);
    expect(del.status).toBe(204);

    const revoked = await prisma.publicApiKey.findUnique({ where: { id } });
    expect(revoked?.revokedAt).toBeTruthy();
  });
});
