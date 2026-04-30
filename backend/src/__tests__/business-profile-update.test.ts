import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";

/**
 * Phase 5 Agent M6 — PATCH /api/me/business-profile
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

const { updateMock, auditMock } = vi.hoisted(() => ({
  updateMock: vi.fn(async () => ({})),
  auditMock: vi.fn(async () => ({})),
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    organization: {
      findUnique: vi.fn(async () => ({ status: "ACTIVE", aiSystemPrompt: "x" })),
      update: updateMock,
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "u1", tokenVersion: 0 })),
    },
    tenantProvisioning: { findUnique: vi.fn(async () => null) },
    dunningState: { findFirst: vi.fn(async () => null) },
    auditLog: { create: auditMock },
  },
}));

vi.mock("../services/provisioning/index.js", () => ({
  enqueueProvisioning: vi.fn(async () => ({ jobId: "j1" })),
}));
vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
  sentryEnabled: false,
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import meRoutes from "../routes/me.js";

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
  updateMock.mockClear();
  auditMock.mockClear();
});

async function patch(body: any, withToken = true) {
  return fetch(`http://127.0.0.1:${port}/api/me/business-profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(withToken ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/me/business-profile", () => {
  it("401 without token", async () => {
    const res = await patch({ aiCallerName: "x" }, false);
    expect(res.status).toBe(401);
  });

  it("happy path saves and audits", async () => {
    const res = await patch({
      aiCallerName: "Alex",
      aiCallerCompany: "Acme Inc",
      aiSystemPrompt:
        "We help small businesses get more clients with AI-powered calling. The goal is to book a 15-min discovery call.",
    });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
    expect(auditMock).toHaveBeenCalledOnce();
    const audit = auditMock.mock.calls[0][0] as any;
    expect(audit.data.action).toBe("BUSINESS_PROFILE_UPDATED");
  });

  it("400 on too-short prompt", async () => {
    const res = await patch({
      aiCallerName: "Alex",
      aiCallerCompany: "Acme",
      aiSystemPrompt: "too short",
    });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400 on too-long caller name", async () => {
    const res = await patch({
      aiCallerName: "x".repeat(60),
      aiCallerCompany: "Acme",
      aiSystemPrompt: "a".repeat(60),
    });
    expect(res.status).toBe(400);
  });

  it("strips HTML from inputs", async () => {
    const res = await patch({
      aiCallerName: "<script>alert(1)</script>Alex",
      aiCallerCompany: "<b>Acme</b>",
      aiSystemPrompt:
        "<i>We help small businesses get more clients with AI-powered calling and book discovery calls.</i>",
    });
    expect(res.status).toBe(200);
    const args = updateMock.mock.calls[0][0] as any;
    expect(args.data.aiCallerName).not.toContain("<");
    expect(args.data.aiCallerCompany).not.toContain("<b>");
    expect(args.data.aiSystemPrompt).not.toContain("<i>");
  });
});
