import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M4 — deprovisionTenant helper tests.
 *
 * Asserts: deleteAssistant + releaseNumber both invoked, 404s tolerated,
 * status moves to DEPROVISIONED, audit row written.
 */

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NEXTAUTH_SECRET ||= "test-nextauth";
process.env.PLATFORM_JWT_SECRET ||= "test-platform";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend";
process.env.STRIPE_PRICE_PAYG_TOPUP_25 ||= "price_test";
process.env.PAYG_LOW_BALANCE_ALERT_CENTS ||= "1000";
process.env.PAYG_AUTO_RECHARGE_DEFAULT_THRESHOLD_CENTS ||= "1000";
process.env.PAYG_AUTO_RECHARGE_DEFAULT_AMOUNT_CENTS ||= "2500";
process.env.PLATFORM_VAPI_PRIVATE_KEY ||= "platform-vapi-key";
process.env.PLATFORM_GEMINI_API_KEY ||= "platform-gemini-key";
process.env.PLATFORM_GOOGLE_PLACES_API_KEY ||= "platform-places-key";

const state = vi.hoisted(() => ({
  row: null as any,
  audits: [] as any[],
  tpUpdate: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    tenantProvisioning: {
      findUnique: vi.fn(async () => state.row),
      update: state.tpUpdate,
    },
  },
}));

vi.mock("../lib/audit.js", () => ({
  writeAudit: async (a: any) => {
    state.audits.push(a);
  },
}));
vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
  sentryEnabled: false,
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/queue.js", () => ({
  provisioningQueue: { add: vi.fn() },
}));

const { deleteAssistantMock, releaseNumberMock } = vi.hoisted(() => ({
  deleteAssistantMock: vi.fn(),
  releaseNumberMock: vi.fn(),
}));
vi.mock("../services/provisioning/vapiPlatform.js", () => ({
  deleteAssistant: (...a: any[]) => deleteAssistantMock(...a),
  releaseNumber: (...a: any[]) => releaseNumberMock(...a),
}));

import { deprovisionTenant } from "../services/provisioning/index.js";

beforeEach(() => {
  state.row = {
    id: "tp1",
    organizationId: "org_a",
    status: "READY",
    vapiAssistantId: "as_1",
    vapiPhoneNumberId: "pn_1",
  };
  state.audits.length = 0;
  state.tpUpdate.mockReset().mockImplementation(async ({ data }: any) => {
    state.row = { ...state.row, ...data };
    return state.row;
  });
  deleteAssistantMock.mockReset().mockResolvedValue(undefined);
  releaseNumberMock.mockReset().mockResolvedValue(undefined);
});

describe("deprovisionTenant", () => {
  it("calls deleteAssistant + releaseNumber and marks DEPROVISIONED", async () => {
    await deprovisionTenant("org_a");
    expect(deleteAssistantMock).toHaveBeenCalledWith("as_1");
    expect(releaseNumberMock).toHaveBeenCalledWith("pn_1");
    expect(state.row.status).toBe("DEPROVISIONED");
    expect(state.audits.some((a) => a.action === "TENANT_DEPROVISIONED")).toBe(true);
  });

  it("tolerates upstream 404-equivalent (wrapper has already swallowed)", async () => {
    // The wrapper swallows 404 internally. Simulate that by resolving.
    deleteAssistantMock.mockResolvedValueOnce(undefined);
    releaseNumberMock.mockResolvedValueOnce(undefined);
    await expect(deprovisionTenant("org_a")).resolves.not.toThrow();
    expect(state.row.status).toBe("DEPROVISIONED");
  });

  it("still marks DEPROVISIONED if deleteAssistant throws non-404", async () => {
    deleteAssistantMock.mockRejectedValueOnce(new Error("upstream 502"));
    await deprovisionTenant("org_a");
    // releaseNumber still attempted
    expect(releaseNumberMock).toHaveBeenCalledWith("pn_1");
    expect(state.row.status).toBe("DEPROVISIONED");
    const audit = state.audits.find((a) => a.action === "TENANT_DEPROVISIONED");
    expect(audit?.metadata?.hadErrors).toBe(true);
  });

  it("no-op (warn only) if no provisioning row exists", async () => {
    state.row = null;
    await deprovisionTenant("org_a");
    expect(deleteAssistantMock).not.toHaveBeenCalled();
    expect(releaseNumberMock).not.toHaveBeenCalled();
  });
});
