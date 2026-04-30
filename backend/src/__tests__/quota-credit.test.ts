import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
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
      // Probe a column added during prod-hardening to confirm the test DB
      // is on a current schema. Skip gracefully on stale schemas.
      await prisma.$queryRawUnsafe('SELECT "vapiPhoneNumberId" FROM "Organization" LIMIT 1');
      schemaReady = true;
    } catch {
      schemaReady = false;
    }
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function buildApp(): Promise<express.Express> {
  const mod = await import("../routes/platform/quotaCredit.js");
  const app = express();
  app.use(express.json());
  app.use("/api/platform/orgs", mod.default);
  return app;
}

function postJson(
  port: number,
  path: string,
  headers: Record<string, string>,
  body: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: any;
          try { parsed = JSON.parse(text); } catch { parsed = text; }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

describe("POST /api/platform/orgs/:orgId/quota/credit", () => {
  it("decrements counter and writes AuditLog; clamps at 0", async () => {
    if (!dbUp) {
      console.warn("skipping: DB not reachable");
      return;
    }
    if (!schemaReady) {
      console.warn("skipping: schema is stale (Organization.vapiPhoneNumberId missing)");
      return;
    }
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    let orgId = "";
    let platformUserId = "";
    try {
      const org = await prisma.organization.create({
        data: { name: `qc-org-${Date.now()}` },
      });
      orgId = org.id;
      const pu = await prisma.platformUser.create({
        data: {
          email: `qc-platform-${Date.now()}@x.test`,
          passwordHash: "x",
          isSuperAdmin: true,
        },
      });
      platformUserId = pu.id;
      const token = jwt.sign({ id: pu.id, email: pu.email }, process.env.PLATFORM_JWT_SECRET!);
      const auth = { Authorization: `Bearer ${token}` };

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await prisma.usageRecord.create({
        data: {
          organizationId: orgId,
          periodStart,
          periodEnd,
          callsMade: 50,
        },
      });

      // Credit 30 — should leave 20.
      const r1 = await postJson(
        port,
        `/api/platform/orgs/${orgId}/quota/credit`,
        auth,
        { kind: "VAPI_CALL", units: 30, reason: "support credit" }
      );
      expect(r1.status).toBe(200);
      expect(r1.body.before).toBe(50);
      expect(r1.body.after).toBe(20);
      expect(r1.body.applied).toBe(30);

      // Credit 999999 — should clamp at 0 with applied=20.
      const r2 = await postJson(
        port,
        `/api/platform/orgs/${orgId}/quota/credit`,
        auth,
        { kind: "VAPI_CALL", units: 999_999, reason: "wipe" }
      );
      expect(r2.status).toBe(200);
      expect(r2.body.after).toBe(0);
      expect(r2.body.applied).toBe(20);

      const audits = await prisma.auditLog.findMany({
        where: { action: "QUOTA_CREDIT", organizationId: orgId },
      });
      expect(audits.length).toBe(2);
    } finally {
      server.close();
      if (orgId) {
        await prisma.usageRecord.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
      }
      if (platformUserId)
        await prisma.platformUser.delete({ where: { id: platformUserId } }).catch(() => {});
    }
  });
});
