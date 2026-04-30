import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Phase 5 Agent M1 — Tenant payloads must NOT carry `billingMode`.
 *
 * Two surfaces are guarded today:
 *   POST /api/auth/register
 *   PATCH /api/settings/ai-caller
 *   POST /api/settings/  (api-keys upsert)
 *
 * All three must reject with 400 INVALID_BILLING_MODE if the body contains
 * a `billingMode` key, even when the value is otherwise valid. This prevents
 * a malicious / buggy tenant from escaping platform metering by self-flipping
 * to BYOK.
 *
 * Logic-only: prisma is fully mocked so the suite runs without a DB.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";

// Stub prisma — none of the rejection paths should actually touch the DB,
// but stub findUnique etc. to keep the auth middleware happy on the
// settings router.
const prismaStub = {
  user: {
    findUnique: vi.fn(async () => ({ id: "u1", tokenVersion: 0 })),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(async () => ({ status: "ACTIVE" })),
    create: vi.fn(),
    update: vi.fn(),
  },
  plan: { findUnique: vi.fn() },
  apiKey: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  subscription: { create: vi.fn() },
  $transaction: vi.fn(async (fn: any) => fn(prismaStub)),
  $queryRaw: vi.fn(),
};
vi.mock("../lib/prisma.js", () => ({ default: prismaStub }));
// Avoid pulling in nodemailer / Resend at import time.
vi.mock("../lib/email.js", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
  APP_URL: "http://localhost:3000",
}));

let port = 0;
let tenantToken = "";

beforeAll(async () => {
  const authMod = await import("../routes/auth.js");
  const settingsMod = await import("../routes/settings.js");
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authMod.default);
  app.use("/api/settings", settingsMod.default);
  const server = app.listen(0);
  port = (server.address() as any).port;

  tenantToken = jwt.sign(
    {
      userId: "u1",
      organizationId: "org1",
      email: "u@test.local",
      role: "ADMIN",
      tokenVersion: 0,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "5m" }
  );
});

function send(
  method: "POST" | "PATCH",
  path: string,
  body: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
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

describe("billingMode tenant-side rejection (Agent M1)", () => {
  it("POST /api/auth/register with billingMode -> 400 INVALID_BILLING_MODE", async () => {
    const r = await send("POST", "/api/auth/register", {
      email: "x@test.local",
      password: "Aa1!aaaaaaa",
      name: "X",
      orgName: "X Co",
      billingMode: "BYOK",
    });
    expect(r.status).toBe(400);
    expect(r.body?.error).toBe("INVALID_BILLING_MODE");
    // Ensure no org was created — the rejection short-circuits before
    // any prisma write.
    expect(prismaStub.organization.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/settings/ai-caller with billingMode -> 400 INVALID_BILLING_MODE", async () => {
    const r = await send(
      "PATCH",
      "/api/settings/ai-caller",
      {
        aiCallerName: "Alex",
        aiCallerCompany: "Acme",
        billingMode: "PAYG",
      },
      { authorization: `Bearer ${tenantToken}` }
    );
    expect(r.status).toBe(400);
    expect(r.body?.error).toBe("INVALID_BILLING_MODE");
    expect(prismaStub.organization.update).not.toHaveBeenCalled();
  });

  it("POST /api/settings/ (api-keys) with billingMode -> 400 INVALID_BILLING_MODE", async () => {
    const r = await send(
      "POST",
      "/api/settings/",
      { vapiKey: "vk_xxx", billingMode: "BYOK" },
      { authorization: `Bearer ${tenantToken}` }
    );
    expect(r.status).toBe(400);
    expect(r.body?.error).toBe("INVALID_BILLING_MODE");
    expect(prismaStub.apiKey.create).not.toHaveBeenCalled();
    expect(prismaStub.apiKey.update).not.toHaveBeenCalled();
  });

  it("POST /api/settings/ WITHOUT billingMode is not blocked by the guard", async () => {
    // Sanity check — the guard is keyed on the explicit `billingMode`
    // property, not a generic strict-schema. A normal api-key payload
    // must still flow through.
    prismaStub.apiKey.findUnique.mockResolvedValueOnce(null);
    prismaStub.apiKey.create.mockResolvedValueOnce({ id: "ak1" });
    const r = await send(
      "POST",
      "/api/settings/",
      { vapiKey: "vk_xxx" },
      { authorization: `Bearer ${tenantToken}` }
    );
    // We're not asserting the success path's exact shape (validation calls
    // would hit the network); only that we did NOT short-circuit with the
    // billing-mode 400.
    expect(r.body?.error).not.toBe("INVALID_BILLING_MODE");
  });
});
