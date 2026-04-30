import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M4 — POST /api/platform/organizations/:orgId/provisioning/retry
 *
 * Asserts:
 *  - PlatformAuth required (no token → 401)
 *  - missing TenantProvisioning row → 404
 *  - row.status === READY → 409
 *  - row.status === FAILED → 200 + jobId, audit row written
 *  - missing defaultPaymentMethodId → 400
 */

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
  process.env.NEXTAUTH_SECRET ||= "test-nextauth";
  process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
  process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook";
  process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
  process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
  process.env.DNC_HASH_PEPPER ||= "test-pepper";
  process.env.RESEND_WEBHOOK_SECRET ||= "test-resend";
  process.env.STRIPE_PRICE_PAYG_TOPUP_25 ||= "price_test";
  process.env.PAYG_LOW_BALANCE_ALERT_CENTS ||= "1000";
  process.env.PAYG_AUTO_RECHARGE_DEFAULT_THRESHOLD_CENTS ||= "1000";
  process.env.PAYG_AUTO_RECHARGE_DEFAULT_AMOUNT_CENTS ||= "2500";
  process.env.PLATFORM_VAPI_PRIVATE_KEY ||= "platform-vapi-key";
  process.env.PLATFORM_GEMINI_API_KEY ||= "platform-gemini-key";
  process.env.PLATFORM_GOOGLE_PLACES_API_KEY ||= "platform-places-key";
});

let row: any = null;
const audits: any[] = [];
const enqueueMock = vi.fn(async (orgId: string) => ({
  jobId: `provision:${orgId}`,
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    tenantProvisioning: {
      findUnique: vi.fn(async () => row),
    },
    platformUser: {
      findUnique: vi.fn(async () => ({
        id: "p1",
        email: "admin@callora.test",
        isSuperAdmin: true,
      })),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        audits.push(data);
        return data;
      }),
    },
  },
}));

vi.mock("../services/provisioning/index.js", () => ({
  enqueueProvisioning: (...a: any[]) => enqueueMock(...(a as [string])),
}));

vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
  sentryEnabled: false,
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import provisioningRoutes from "../routes/platform/provisioning.js";

const app = express();
app.use(express.json());
app.use("/api/platform/organizations", provisioningRoutes);

const platformToken = jwt.sign(
  { id: "p1", email: "admin@callora.test" },
  process.env.PLATFORM_JWT_SECRET!,
  { expiresIn: "1h" }
);

let server: any;
let port = 0;

beforeAll(async () => {
  server = app.listen(0);
  port = (server.address() as any).port;
});

beforeEach(() => {
  row = null;
  audits.length = 0;
  enqueueMock.mockClear();
});

async function call(orgId: string, opts: { token?: string } = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.token !== null) {
    headers.Authorization = `Bearer ${opts.token ?? platformToken}`;
  }
  return fetch(
    `http://127.0.0.1:${port}/api/platform/organizations/${orgId}/provisioning/retry`,
    { method: "POST", headers }
  );
}

describe("POST /api/platform/organizations/:orgId/provisioning/retry", () => {
  it("401 without platform JWT", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/platform/organizations/org_a/provisioning/retry`,
      { method: "POST" }
    );
    expect(res.status).toBe(401);
  });

  it("404 when no TenantProvisioning row exists", async () => {
    row = null;
    const res = await call("org_missing");
    expect(res.status).toBe(404);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("409 when status is READY", async () => {
    row = {
      organizationId: "org_a",
      status: "READY",
      defaultPaymentMethodId: "pm_x",
    };
    const res = await call("org_a");
    expect(res.status).toBe(409);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("400 when no payment method on file", async () => {
    row = {
      organizationId: "org_a",
      status: "FAILED",
      defaultPaymentMethodId: null,
    };
    const res = await call("org_a");
    expect(res.status).toBe(400);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("200 + jobId on FAILED row, writes audit", async () => {
    row = {
      organizationId: "org_a",
      status: "FAILED",
      defaultPaymentMethodId: "pm_test_xyz",
    };
    const res = await call("org_a");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("provision:org_a");
    expect(enqueueMock).toHaveBeenCalledWith("org_a", "pm_test_xyz");
    expect(audits.some((a) => a.action === "PROVISIONING_RETRIED")).toBe(true);
  });
});
