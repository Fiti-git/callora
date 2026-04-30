import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Phase 5 Agent M1 — PlatformUser-only BillingMode toggle.
 *
 * Asserts:
 *   * Setting BYOK with apiKeys upserts ApiKey using encryptString-encrypted
 *     values (every persisted key starts with the v1: envelope).
 *   * AuditLog row is written with action `BILLING_MODE_CHANGED`,
 *     keysProvided=true, AND the raw key values do NOT appear in metadata.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";

const auditCreate = vi.fn(async (args: any) => args);
const apiKeyUpsert = vi.fn(async (args: any) => ({ id: "ak1", ...args.create }));

const prismaStub = {
  organization: {
    findUnique: vi.fn(async () => ({ id: "org1", billingMode: "PAYG" })),
    update: vi.fn(async ({ data }: any) => ({ id: "org1", billingMode: data.billingMode })),
  },
  platformUser: {
    findUnique: vi.fn(async () => ({
      id: "p1",
      email: "admin@callora.test",
      isSuperAdmin: true,
    })),
  },
  apiKey: { upsert: apiKeyUpsert },
  auditLog: { create: auditCreate },
};
vi.mock("../lib/prisma.js", () => ({ default: prismaStub }));

let port = 0;
let platformToken = "";
const RAW_VAPI = "vapi_super_secret_raw_value";
const RAW_GEMINI = "gemini_super_secret_raw_value";
const RAW_GOOGLE = "google_maps_raw_value";

beforeAll(async () => {
  const mod = await import("../routes/platform/organizations.js");
  const app = express();
  app.use(express.json());
  app.use("/api/platform/organizations", mod.default);
  const server = app.listen(0);
  port = (server.address() as any).port;
  platformToken = jwt.sign(
    { id: "p1", email: "admin@callora.test" },
    process.env.PLATFORM_JWT_SECRET!,
    { expiresIn: "5m" }
  );
});

function patch(path: string, body: any, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "PATCH",
        path,
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

describe("PATCH /api/platform/organizations/:orgId/billing-mode (with keys)", () => {
  it("rejects unauthenticated callers", async () => {
    const r = await patch("/api/platform/organizations/org1/billing-mode", {
      billingMode: "BYOK",
      reason: "qa",
    });
    expect(r.status).toBe(401);
  });

  it("encrypts each provided key, upserts ApiKey, writes BILLING_MODE_CHANGED audit", async () => {
    const r = await patch(
      "/api/platform/organizations/org1/billing-mode",
      {
        billingMode: "BYOK",
        reason: "Internal QA org — using Callora dev Vapi keys",
        apiKeys: {
          vapiPrivateKey: RAW_VAPI,
          vapiPhoneNumberId: "phn_123",
          geminiApiKey: RAW_GEMINI,
          googleMapsKey: RAW_GOOGLE,
        },
      },
      { authorization: `Bearer ${platformToken}` }
    );

    expect(r.status).toBe(200);
    expect(r.body?.organization?.billingMode).toBe("BYOK");
    expect(r.body?.keysProvided).toBe(true);

    expect(apiKeyUpsert).toHaveBeenCalledTimes(1);
    const upsertArgs = apiKeyUpsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ organizationId: "org1" });

    // Every provided key must have been encrypted (v1: envelope) and the
    // RAW values must NOT appear in either branch of the upsert.
    const persisted = { ...upsertArgs.update, ...upsertArgs.create };
    for (const k of ["googleMapsKey", "geminiKey", "vapiKey", "vapiPhoneId"]) {
      expect(persisted[k]).toBeTruthy();
      expect(persisted[k]).toMatch(/^v1:/);
    }
    const serialized = JSON.stringify(upsertArgs);
    expect(serialized).not.toContain(RAW_VAPI);
    expect(serialized).not.toContain(RAW_GEMINI);
    expect(serialized).not.toContain(RAW_GOOGLE);

    // Audit row.
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const auditArgs = auditCreate.mock.calls[0][0];
    expect(auditArgs.data.action).toBe("BILLING_MODE_CHANGED");
    expect(auditArgs.data.actorType).toBe("PLATFORM_USER");
    expect(auditArgs.data.actorId).toBe("p1");
    expect(auditArgs.data.entity).toBe("Organization");
    expect(auditArgs.data.entityId).toBe("org1");
    expect(auditArgs.data.metadata.from).toBe("PAYG");
    expect(auditArgs.data.metadata.to).toBe("BYOK");
    expect(auditArgs.data.metadata.keysProvided).toBe(true);
    // Raw key values must NEVER land in the audit row.
    const auditSerialized = JSON.stringify(auditArgs);
    expect(auditSerialized).not.toContain(RAW_VAPI);
    expect(auditSerialized).not.toContain(RAW_GEMINI);
    expect(auditSerialized).not.toContain(RAW_GOOGLE);
  });

  it("rejects payload missing `reason`", async () => {
    const r = await patch(
      "/api/platform/organizations/org1/billing-mode",
      { billingMode: "PAYG" },
      { authorization: `Bearer ${platformToken}` }
    );
    expect(r.status).toBe(400);
  });
});
