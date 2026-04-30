import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";

/**
 * Phase 5 Agent M6 — GET /api/me/provisioning-status
 *
 * Asserts:
 *  - 401 without token
 *  - PENDING shape when no row exists
 *  - shape + step counts when row exists
 *  - failureReason scrubbed (defence-in-depth)
 *  - phoneNumberE164 only when status===READY
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

const { rowRef } = vi.hoisted(() => ({
  rowRef: { current: null as any },
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    organization: {
      findUnique: vi.fn(async () => ({ status: "ACTIVE" })),
      update: vi.fn(async () => ({})),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "u1", tokenVersion: 0 })),
    },
    tenantProvisioning: {
      findUnique: vi.fn(async () => rowRef.current),
    },
    dunningState: {
      findFirst: vi.fn(async () => null),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
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
app.use(express.json());
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
});

async function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${port}${path}`, { headers });
}

describe("GET /api/me/provisioning-status", () => {
  it("401 without auth", async () => {
    const res = await get("/api/me/provisioning-status");
    expect(res.status).toBe(401);
  });

  it("PENDING shape when no row exists", async () => {
    rowRef.current = null;
    const res = await get("/api/me/provisioning-status", {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("PENDING");
    expect(body.completedSteps).toBe(0);
    expect(body.totalSteps).toBe(6);
    expect(body.failureReason).toBeNull();
    expect(body.phoneNumberE164).toBeNull();
    expect(body.steps.customer).toBe("pending");
  });

  it("counts done steps", async () => {
    rowRef.current = {
      status: "PROVISIONING",
      vapiPhoneE164: "+14155550000",
      failureReason: null,
      steps: {
        customer: "done",
        paymentMethod: "done",
        firstTopUp: "done",
        phoneNumber: "pending",
        assistant: "pending",
        attach: "pending",
      },
      updatedAt: new Date(),
    };
    const res = await get("/api/me/provisioning-status", {
      Authorization: `Bearer ${token}`,
    });
    const body = await res.json();
    expect(body.status).toBe("PROVISIONING");
    expect(body.completedSteps).toBe(3);
    expect(body.phoneNumberE164).toBeNull(); // visible only when READY
  });

  it("exposes phoneNumberE164 only when READY", async () => {
    rowRef.current = {
      status: "READY",
      vapiPhoneE164: "+14155551234",
      failureReason: null,
      steps: {
        customer: "done",
        paymentMethod: "done",
        firstTopUp: "done",
        phoneNumber: "done",
        assistant: "done",
        attach: "done",
      },
      updatedAt: new Date(),
    };
    const res = await get("/api/me/provisioning-status", {
      Authorization: `Bearer ${token}`,
    });
    const body = await res.json();
    expect(body.status).toBe("READY");
    expect(body.completedSteps).toBe(6);
    expect(body.phoneNumberE164).toBe("+14155551234");
  });

  it("scrubs vendor names from failureReason", async () => {
    rowRef.current = {
      status: "FAILED",
      vapiPhoneE164: null,
      failureReason: "Vapi rejected the request from Twilio",
      steps: {},
      updatedAt: new Date(),
    };
    const res = await get("/api/me/provisioning-status", {
      Authorization: `Bearer ${token}`,
    });
    const body = await res.json();
    expect(body.status).toBe("FAILED");
    expect(body.failureReason.toLowerCase()).not.toContain("vapi");
    expect(body.failureReason.toLowerCase()).not.toContain("twilio");
  });
});
