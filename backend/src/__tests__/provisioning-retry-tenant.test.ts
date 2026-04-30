import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";

/**
 * Phase 5 Agent M6 — POST /api/me/provisioning/retry (tenant-callable)
 */

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
  process.env.NEXTAUTH_SECRET ||= "test-nextauth";
  process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
  process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook";
  process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
  process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
});

const { enqueueMock, auditMock, rowRef } = vi.hoisted(() => ({
  enqueueMock: vi.fn(async () => ({ jobId: "j_prov" })),
  auditMock: vi.fn(async () => ({})),
  rowRef: { current: null as any },
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    organization: {
      findUnique: vi.fn(async () => ({ status: "ACTIVE", aiSystemPrompt: "x" })),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "u1", tokenVersion: 0 })),
    },
    tenantProvisioning: {
      findUnique: vi.fn(async () => rowRef.current),
    },
    dunningState: { findFirst: vi.fn(async () => null) },
    auditLog: { create: auditMock },
  },
}));

vi.mock("../services/provisioning/index.js", () => ({
  enqueueProvisioning: enqueueMock,
}));
vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
  sentryEnabled: false,
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import meRoutes from "../routes/me.js";
import { __resetOrgRateLimitForTests } from "../middleware/orgRateLimit.js";

const app = express();
app.use("/api/me", meRoutes);

const token = jwt.sign(
  { userId: "u1", organizationId: "org_a", email: "u@x", role: "ADMIN", tokenVersion: 0 },
  process.env.NEXTAUTH_SECRET!
);

let server: any;
let port = 0;

beforeAll(async () => {
  server = app.listen(0);
  port = (server.address() as any).port;
});

beforeEach(() => {
  rowRef.current = null;
  enqueueMock.mockClear();
  auditMock.mockClear();
  __resetOrgRateLimitForTests();
});

async function post(withToken = true) {
  return fetch(`http://127.0.0.1:${port}/api/me/provisioning/retry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(withToken ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: "{}",
  });
}

describe("POST /api/me/provisioning/retry", () => {
  it("401 without token", async () => {
    const res = await post(false);
    expect(res.status).toBe(401);
  });

  it("404 if no provisioning row", async () => {
    rowRef.current = null;
    const res = await post();
    expect(res.status).toBe(404);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("409 when status is not FAILED", async () => {
    rowRef.current = {
      status: "PROVISIONING",
      defaultPaymentMethodId: "pm_x",
      updatedAt: new Date(),
    };
    const res = await post();
    expect(res.status).toBe(409);
  });

  it("400 when no payment method", async () => {
    rowRef.current = {
      status: "FAILED",
      defaultPaymentMethodId: null,
      updatedAt: new Date(),
    };
    const res = await post();
    expect(res.status).toBe(400);
  });

  it("409 when last failure is older than 24h", async () => {
    rowRef.current = {
      status: "FAILED",
      defaultPaymentMethodId: "pm_x",
      updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    };
    const res = await post();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("RETRY_WINDOW_EXPIRED");
  });

  it("happy path enqueues + audits", async () => {
    rowRef.current = {
      status: "FAILED",
      defaultPaymentMethodId: "pm_x",
      updatedAt: new Date(),
    };
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enqueued).toBe(true);
    expect(enqueueMock).toHaveBeenCalledWith("org_a", "pm_x");
    const audit = auditMock.mock.calls[0][0] as any;
    expect(audit.data.action).toBe("PROVISIONING_RETRIED_BY_TENANT");
  });
});
