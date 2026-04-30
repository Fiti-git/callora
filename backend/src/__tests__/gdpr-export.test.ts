import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

/**
 * GDPR export route — mocked Prisma + Stripe so it runs without DB.
 *
 * What we assert:
 *   1. Non-admin tenants get 403.
 *   2. Admin tenants get a JSON download with the expected per-entity shape.
 *   3. Each entity carries the truncation marker contract: `_truncated`
 *      flips to true when row count exceeds the cap.
 */

const fakeOrg = {
  id: "ckorgaaaaaaaaaaaaaaaaaaaaa",
  name: "Acme",
  status: "ACTIVE",
  tokenVersion: 0,
};
const fakeUser = (role = "ADMIN") => ({
  id: "ckuseraaaaaaaaaaaaaaaaaaaa",
  email: "u@a.test",
  organizationId: fakeOrg.id,
  role,
  tokenVersion: 0,
});

// Fixed-size row generators — the Prisma mock returns these. We let the
// tests bump certain entities past the cap by mutating the array length.
let leadRows: any[] = [{ id: "l1", businessName: "x" }];
let contactRows: any[] = [{ id: "c1", businessName: "x" }];

vi.mock("../lib/prisma.js", () => {
  const wrap = (rows: () => any[]) => async () => rows();
  const empty = async () => [];
  const stub = {
    organization: {
      findUnique: async ({ where: { id } }: any) =>
        id === fakeOrg.id ? fakeOrg : null,
    },
    user: {
      findMany: wrap(() => [{ id: fakeUser().id, email: fakeUser().email, role: "ADMIN" }]),
      findUnique: async ({ where: { id } }: any) =>
        id === fakeUser().id ? { id: fakeUser().id, tokenVersion: 0 } : null,
    },
    contact: { findMany: wrap(() => contactRows) },
    lead: { findMany: wrap(() => leadRows) },
    deal: { findMany: empty },
    task: { findMany: empty },
    note: { findMany: empty },
    campaign: { findMany: empty },
    callLog: { findMany: empty },
    subscription: { findUnique: async () => null },
    usageRecord: { findMany: empty },
    emailLog: { findMany: empty },
    blacklist: { findMany: empty },
    auditLog: { create: async () => ({ id: "a1" }) },
  };
  return { default: stub, rawPrisma: stub };
});

vi.mock("../services/stripe.js", () => ({
  ensureStripe: () => ({
    invoices: { list: async () => ({ data: [] }) },
    subscriptions: { cancel: async () => ({ id: "sub_x", status: "canceled" }) },
  }),
}));

let port = 0;
let adminToken = "";
let memberToken = "";

beforeAll(async () => {
  const mod = await import("../routes/privacy.js");
  const app = express();
  app.use(express.json());
  app.use("/api/gdpr", mod.default);
  const server = app.listen(0);
  port = (server.address() as any).port;

  adminToken = jwt.sign(
    {
      userId: fakeUser().id,
      organizationId: fakeOrg.id,
      email: fakeUser().email,
      role: "ADMIN",
      tokenVersion: 0,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "5m" }
  );
  memberToken = jwt.sign(
    {
      userId: fakeUser().id,
      organizationId: fakeOrg.id,
      email: fakeUser().email,
      role: "MEMBER",
      tokenVersion: 0,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "5m" }
  );
});

function get(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: any; headers: any }>(
    (resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path, method: "GET", headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let body: any;
            try {
              body = JSON.parse(text);
            } catch {
              body = text;
            }
            resolve({
              status: res.statusCode ?? 0,
              body,
              headers: res.headers,
            });
          });
        }
      );
      req.on("error", reject);
      req.end();
    }
  );
}

describe("GET /api/gdpr/export", () => {
  it("rejects non-admin users with 403", async () => {
    const r = await get("/api/gdpr/export", {
      authorization: `Bearer ${memberToken}`,
    });
    expect(r.status).toBe(403);
  });

  it("returns a JSON bundle with all expected entities for admins", async () => {
    leadRows = [{ id: "l1", businessName: "Acme" }];
    contactRows = [{ id: "c1", businessName: "Acme" }];
    const r = await get("/api/gdpr/export", {
      authorization: `Bearer ${adminToken}`,
    });
    expect(r.status).toBe(200);
    expect(String(r.headers["content-disposition"] ?? "")).toContain(
      "attachment"
    );
    for (const k of [
      "organization",
      "users",
      "contacts",
      "leads",
      "deals",
      "tasks",
      "notes",
      "campaigns",
      "callLogs",
      "emailLogs",
      "blacklist",
    ]) {
      expect(r.body).toHaveProperty(k);
    }
    expect(r.body.users).toMatchObject({ _entity: "users", _truncated: false });
  });

  it("flags _truncated on entities that exceed the cap", async () => {
    // 100k+1 rows — cap is 100_000.
    leadRows = Array.from({ length: 100_001 }, (_, i) => ({
      id: `l${i}`,
      businessName: "x",
    }));
    const r = await get("/api/gdpr/export", {
      authorization: `Bearer ${adminToken}`,
    });
    expect(r.status).toBe(200);
    expect(r.body.leads._truncated).toBe(true);
    expect(r.body.leads.items.length).toBe(100_000);
  });
});
