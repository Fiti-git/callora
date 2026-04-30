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
  const mod = await import("../routes/platform/impersonate.js");
  const app = express();
  app.use(express.json());
  app.use("/api/platform/impersonate", mod.default);
  return app;
}

function postJson(
  port: number,
  path: string,
  headers: Record<string, string>,
  body: any = {}
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
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

describe("POST /api/platform/impersonate/:orgId", () => {
  it("requires a platform JWT", async () => {
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await postJson(port, "/api/platform/impersonate/anything", {});
      expect(res.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("issues a 15-minute tenant token + writes AuditLog", async () => {
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
    let userId = "";
    let platformUserId = "";
    try {
      const org = await prisma.organization.create({
        data: { name: `imp-org-${Date.now()}` },
      });
      orgId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `imp-user-${Date.now()}@x.test`,
          password: "x",
          role: "ADMIN",
          organizationId: orgId,
        },
      });
      userId = user.id;
      const pu = await prisma.platformUser.create({
        data: {
          email: `imp-platform-${Date.now()}@x.test`,
          passwordHash: "x",
          isSuperAdmin: true,
        },
      });
      platformUserId = pu.id;

      const platformToken = jwt.sign(
        { id: pu.id, email: pu.email },
        process.env.PLATFORM_JWT_SECRET!
      );

      const res = await postJson(
        port,
        `/api/platform/impersonate/${orgId}`,
        { Authorization: `Bearer ${platformToken}` }
      );
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTypeOf("string");

      const decoded = jwt.verify(
        res.body.accessToken,
        process.env.NEXTAUTH_SECRET!
      ) as any;
      expect(decoded.organizationId).toBe(orgId);
      expect(decoded.impersonatedBy).toBe(pu.id);
      expect(decoded.exp - decoded.iat).toBe(15 * 60);

      // AuditLog entry written.
      const log = await prisma.auditLog.findFirst({
        where: { action: "IMPERSONATE", target: orgId },
        orderBy: { createdAt: "desc" },
      });
      expect(log).not.toBeNull();
    } finally {
      server.close();
      if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      if (orgId) await prisma.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
      if (platformUserId)
        await prisma.platformUser.delete({ where: { id: platformUserId } }).catch(() => {});
    }
  });
});
