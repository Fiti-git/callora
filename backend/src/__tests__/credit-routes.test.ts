import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M2 — credit routes shape + validation tests.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";
process.env.NODE_ENV = "test";

const SECRET = process.env.NEXTAUTH_SECRET!;
function makeToken(orgId = "org_a", role = "ADMIN") {
  return jwt.sign(
    { userId: "u1", organizationId: orgId, email: "u@x.com", role, tokenVersion: 0 },
    SECRET
  );
}

async function callRoute(opts: {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: any;
  token?: string;
  prismaOverrides?: any;
  chargeTopUpMock?: any;
}): Promise<{ status: number; body: any }> {
  vi.resetModules();

  vi.doMock("../services/stripe.js", () => ({
    verifyWebhook: vi.fn(),
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    stripe: {},
    ensureStripe: () => ({}),
  }));

  vi.doMock("../services/stripeBilling.js", () => ({
    ensureStripeCustomer: vi.fn(async () => "cus_x"),
    createSetupIntent: vi.fn(async () => ({
      clientSecret: "seti_x_secret",
      setupIntentId: "seti_x",
    })),
    confirmDefaultPaymentMethod: vi.fn(async () => undefined),
    chargeTopUp: opts.chargeTopUpMock ?? vi.fn(async () => ({ paymentIntentId: "pi_1", status: "succeeded" })),
  }));

  vi.doMock("../lib/email.js", () => ({
    APP_URL: "http://localhost:3000",
    sendEmail: vi.fn(async () => undefined),
  }));
  vi.doMock("../lib/audit.js", () => ({
    writeAudit: vi.fn(async () => undefined),
    writeAuditLog: vi.fn(async () => undefined),
  }));
  vi.doMock("../lib/sentry.js", () => ({
    Sentry: { captureException: vi.fn() },
    sentryEnabled: false,
  }));

  const defaultPrisma = {
    user: { findUnique: async () => ({ id: "u1", tokenVersion: 0 }) },
    organization: { findUnique: async () => ({ status: "ACTIVE" }) },
    creditLedger: {
      findUnique: async () => ({
        balanceCents: 1500,
        autoRechargeEnabled: true,
        autoRechargeThresholdCents: 1000,
        autoRechargeAmountCents: 2500,
      }),
      upsert: async ({ create, update }: any) => ({ id: "led_1", ...create, ...update }),
    },
    tenantProvisioning: {
      findUnique: async () => ({ defaultPaymentMethodId: "pm_x" }),
    },
    creditTransaction: {
      findMany: async () => [],
    },
    stripeWebhookEvent: { findUnique: async () => null, upsert: async () => ({}) },
  };

  vi.doMock("../lib/prisma.js", () => ({
    default: { ...defaultPrisma, ...(opts.prismaOverrides ?? {}) },
  }));

  const mod = await import("../routes/billing.js");
  const app = express();
  app.use("/api/billing", mod.default);

  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const body = opts.body ? JSON.stringify(opts.body) : "";
      const headers: Record<string, string> = {};
      if (body) {
        headers["content-type"] = "application/json";
        headers["content-length"] = String(Buffer.byteLength(body));
      }
      if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
      const req = http.request(
        { host: "127.0.0.1", port, method: opts.method, path: opts.path, headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            server.close();
            const text = Buffer.concat(chunks).toString();
            let parsed: any;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
            resolve({ status: res.statusCode || 0, body: parsed });
          });
        }
      );
      req.on("error", (e) => {
        server.close();
        reject(e);
      });
      if (body) req.write(body);
      req.end();
    });
  });
}

beforeEach(() => {
  vi.resetModules();
});

describe("GET /api/billing/credits", () => {
  it("returns shape with hasPaymentMethod=true when PM on file", async () => {
    const res = await callRoute({
      method: "GET",
      path: "/api/billing/credits",
      token: makeToken(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      balanceCents: 1500,
      autoRechargeEnabled: true,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 2500,
      hasPaymentMethod: true,
    });
  });

  it("defaults when ledger row absent", async () => {
    const res = await callRoute({
      method: "GET",
      path: "/api/billing/credits",
      token: makeToken(),
      prismaOverrides: {
        creditLedger: { findUnique: async () => null },
        tenantProvisioning: { findUnique: async () => null },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(0);
    expect(res.body.hasPaymentMethod).toBe(false);
  });
});

describe("POST /api/billing/credits/topup", () => {
  it("rejects mismatched amountCents with 400", async () => {
    const res = await callRoute({
      method: "POST",
      path: "/api/billing/credits/topup",
      body: { amountCents: 5000 },
      token: makeToken(),
    });
    expect(res.status).toBe(400);
  });

  it("accepts the canonical $25 amount", async () => {
    const res = await callRoute({
      method: "POST",
      path: "/api/billing/credits/topup",
      body: { amountCents: 2500 },
      token: makeToken(),
    });
    expect(res.status).toBe(200);
    expect(res.body.paymentIntentId).toBe("pi_1");
  });
});

describe("PATCH /api/billing/credits/auto-recharge", () => {
  it("rejects out-of-range thresholdCents", async () => {
    const res = await callRoute({
      method: "PATCH",
      path: "/api/billing/credits/auto-recharge",
      body: { enabled: true, thresholdCents: 100, amountCents: 2500 },
      token: makeToken(),
    });
    expect(res.status).toBe(400);
  });

  it("rejects out-of-range amountCents", async () => {
    const res = await callRoute({
      method: "PATCH",
      path: "/api/billing/credits/auto-recharge",
      body: { enabled: true, thresholdCents: 1000, amountCents: 100 },
      token: makeToken(),
    });
    expect(res.status).toBe(400);
  });

  it("accepts valid payload", async () => {
    const res = await callRoute({
      method: "PATCH",
      path: "/api/billing/credits/auto-recharge",
      body: { enabled: true, thresholdCents: 2000, amountCents: 2500 },
      token: makeToken(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: true,
      thresholdCents: 2000,
      amountCents: 2500,
    });
  });
});

describe("POST /api/billing/credits/setup-intent", () => {
  it("returns clientSecret", async () => {
    const res = await callRoute({
      method: "POST",
      path: "/api/billing/credits/setup-intent",
      body: {},
      token: makeToken(),
    });
    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("seti_x_secret");
  });
});
