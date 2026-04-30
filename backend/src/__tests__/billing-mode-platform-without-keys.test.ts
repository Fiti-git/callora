import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Phase 5 Agent M1 — billing-mode toggle without an apiKeys payload.
 *
 * Asserts the route updates Organization.billingMode and writes the audit
 * row, but DOES NOT touch ApiKey when no keys were provided. keysProvided
 * is false in both the response and the audit metadata.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";

const auditCreate = vi.fn(async (args: any) => args);
const apiKeyUpsert = vi.fn(async () => ({ id: "ak1" }));
const orgUpdate = vi.fn(async ({ data }: any) => ({ id: "org1", billingMode: data.billingMode }));

const prismaStub = {
  organization: {
    findUnique: vi.fn(async () => ({ id: "org1", billingMode: "BYOK" })),
    update: orgUpdate,
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

describe("PATCH /api/platform/organizations/:orgId/billing-mode (no keys)", () => {
  it("flipping back to PAYG without apiKeys updates org but skips ApiKey upsert", async () => {
    const r = await patch(
      "/api/platform/organizations/org1/billing-mode",
      { billingMode: "PAYG", reason: "QA org returned to billing pool" },
      { authorization: `Bearer ${platformToken}` }
    );
    expect(r.status).toBe(200);
    expect(r.body?.organization?.billingMode).toBe("PAYG");
    expect(r.body?.keysProvided).toBe(false);

    expect(orgUpdate).toHaveBeenCalledTimes(1);
    expect(apiKeyUpsert).not.toHaveBeenCalled();

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const meta = auditCreate.mock.calls[0][0].data.metadata;
    expect(meta.from).toBe("BYOK");
    expect(meta.to).toBe("PAYG");
    expect(meta.keysProvided).toBe(false);
  });
});
