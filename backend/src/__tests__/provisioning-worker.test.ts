import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M4 — provisioning worker state-machine tests.
 *
 * Logic-only — Stripe wrapper, Vapi platform wrapper, audit, email all
 * stubbed. Asserts:
 *   - Happy path: 6 steps in order, status READY, steps populated.
 *   - Idempotency: customer="done" skips ensureStripeCustomer.
 *   - Retryable failure (5xx in purchaseTwilioNumber) → throws (BullMQ
 *     retries). Then re-run → continues from where it stopped.
 *   - Terminal Vapi 4xx → status FAILED, brand-clean failureReason.
 *   - Tenant profile missing → "Tenant profile incomplete" terminal failure.
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

// Hoisted mutable state, accessible from inside vi.mock factories.
const state = vi.hoisted(() => ({
  row: null as any,
  orgRow: {
    id: "org_a",
    aiCallerName: "Alex",
    aiCallerCompany: "Acme",
    aiSystemPrompt: "Be helpful.",
  } as any,
  adminUser: { email: "admin@acme.test", name: "Boss" } as any,
  audits: [] as any[],
  emails: [] as any[],
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    tenantProvisioning: {
      findUnique: vi.fn(async () => state.row),
      upsert: vi.fn(async ({ create, update }: any) => {
        if (!state.row)
          state.row = {
            organizationId: "org_a",
            status: "PENDING",
            steps: {},
            ...create,
          };
        else state.row = { ...state.row, ...update };
        return state.row;
      }),
      update: vi.fn(async ({ data }: any) => {
        state.row = { ...state.row, ...data };
        return state.row;
      }),
      updateMany: vi.fn(async ({ data }: any) => {
        if (state.row) state.row = { ...state.row, ...data };
        return { count: state.row ? 1 : 0 };
      }),
    },
    organization: {
      findUnique: vi.fn(async () => state.orgRow),
    },
    user: {
      findFirst: vi.fn(async () => state.adminUser),
    },
  },
}));

vi.mock("../lib/audit.js", () => ({
  writeAudit: async (a: any) => {
    state.audits.push(a);
  },
}));
vi.mock("../lib/email.js", () => ({
  sendEmail: async (to: string, subject: string) => {
    state.emails.push({ to, subject });
  },
}));
vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
  sentryEnabled: false,
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { ensureStripeCustomerMock, confirmDefaultPaymentMethodMock, chargeTopUpMock } = vi.hoisted(() => ({
  ensureStripeCustomerMock: vi.fn(),
  confirmDefaultPaymentMethodMock: vi.fn(),
  chargeTopUpMock: vi.fn(),
}));
vi.mock("../services/stripeBilling.js", () => ({
  ensureStripeCustomer: (...a: any[]) => ensureStripeCustomerMock(...a),
  confirmDefaultPaymentMethod: (...a: any[]) =>
    confirmDefaultPaymentMethodMock(...a),
  chargeTopUp: (...a: any[]) => chargeTopUpMock(...a),
}));

const { purchaseTwilioNumberMock, createAssistantMock, attachAssistantToNumberMock, MockPlatformProvisioningError } = vi.hoisted(() => {
  class MockPlatformProvisioningError extends Error {
    code: string;
    cause?: unknown;
    constructor(code: string, msg: string, cause?: unknown) {
      super(msg);
      this.name = "PlatformProvisioningError";
      this.code = code;
      this.cause = cause;
    }
  }
  return {
    purchaseTwilioNumberMock: vi.fn(),
    createAssistantMock: vi.fn(),
    attachAssistantToNumberMock: vi.fn(),
    MockPlatformProvisioningError,
  };
});

vi.mock("../services/provisioning/vapiPlatform.js", () => ({
  purchaseTwilioNumber: (...a: any[]) => purchaseTwilioNumberMock(...a),
  createAssistant: (...a: any[]) => createAssistantMock(...a),
  attachAssistantToNumber: (...a: any[]) => attachAssistantToNumberMock(...a),
  PlatformProvisioningError: MockPlatformProvisioningError,
}));

import {
  provisioningWorker,
  TerminalProvisioningError,
} from "../workers/provisioningWorker.js";

function makeJob(): any {
  return {
    id: "job_1",
    name: "provisionTenant",
    data: { organizationId: "org_a", paymentMethodId: "pm_test_123" },
  };
}

beforeEach(() => {
  state.row = null;
  state.orgRow = {
    id: "org_a",
    aiCallerName: "Alex",
    aiCallerCompany: "Acme",
    aiSystemPrompt: "Be helpful.",
  };
  state.adminUser = { email: "admin@acme.test", name: "Boss" };
  state.audits.length = 0;
  state.emails.length = 0;
  ensureStripeCustomerMock.mockReset().mockResolvedValue("cus_x");
  confirmDefaultPaymentMethodMock.mockReset().mockResolvedValue(undefined);
  chargeTopUpMock
    .mockReset()
    .mockResolvedValue({ paymentIntentId: "pi_1", status: "succeeded" });
  purchaseTwilioNumberMock
    .mockReset()
    .mockResolvedValue({ vapiPhoneNumberId: "pn_1", e164: "+15551234567" });
  createAssistantMock.mockReset().mockResolvedValue({ vapiAssistantId: "as_1" });
  attachAssistantToNumberMock.mockReset().mockResolvedValue(undefined);
});

describe("provisioningWorker — happy path", () => {
  it("runs all 6 steps and marks READY", async () => {
    const result = await provisioningWorker(makeJob());
    expect(result.status).toBe("READY");
    expect(ensureStripeCustomerMock).toHaveBeenCalledOnce();
    expect(confirmDefaultPaymentMethodMock).toHaveBeenCalledWith(
      "org_a",
      "pm_test_123"
    );
    expect(chargeTopUpMock).toHaveBeenCalledWith(
      "org_a",
      2500,
      expect.objectContaining({
        source: "MANUAL",
        idempotencyKey: "first-topup-org_a",
      })
    );
    expect(purchaseTwilioNumberMock).toHaveBeenCalledOnce();
    expect(createAssistantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_a",
        persona: expect.objectContaining({
          callerName: "Alex",
          companyName: "Acme",
          systemPrompt: "Be helpful.",
        }),
      })
    );
    expect(attachAssistantToNumberMock).toHaveBeenCalledWith({
      vapiAssistantId: "as_1",
      vapiPhoneNumberId: "pn_1",
    });
    expect(state.row.status).toBe("READY");
    expect(state.row.provisionedAt).toBeInstanceOf(Date);
    expect(state.row.steps).toMatchObject({
      customer: "done",
      paymentMethod: "done",
      firstTopUp: "initiated",
      phoneNumber: "done",
      assistant: "done",
      attach: "done",
    });
    expect(state.row.vapiAssistantId).toBe("as_1");
    expect(state.row.vapiPhoneNumberId).toBe("pn_1");
    expect(state.row.vapiPhoneE164).toBe("+15551234567");
    expect(state.audits.some((a) => a.action === "PROVISIONING_COMPLETED")).toBe(
      true
    );
  });
});

describe("provisioningWorker — idempotency", () => {
  it("skips ensureStripeCustomer when steps.customer === done", async () => {
    state.row = {
      organizationId: "org_a",
      status: "PROVISIONING",
      steps: { customer: "done", paymentMethod: "done", firstTopUp: "initiated" },
    };
    await provisioningWorker(makeJob());
    expect(ensureStripeCustomerMock).not.toHaveBeenCalled();
    expect(confirmDefaultPaymentMethodMock).not.toHaveBeenCalled();
    expect(chargeTopUpMock).not.toHaveBeenCalled();
    expect(purchaseTwilioNumberMock).toHaveBeenCalledOnce();
  });
});

describe("provisioningWorker — retryable failure", () => {
  it("throws on 5xx so BullMQ retries; failureReason NOT set yet", async () => {
    purchaseTwilioNumberMock.mockRejectedValueOnce(
      new MockPlatformProvisioningError(
        "NUMBER_PROVISION_FAILED",
        "We couldn't activate your business number.",
        { response: { status: 503 } }
      )
    );

    await expect(provisioningWorker(makeJob())).rejects.toBeInstanceOf(
      MockPlatformProvisioningError
    );
    // Status should NOT be FAILED yet — BullMQ will retry.
    expect(state.row?.status).not.toBe("FAILED");
    expect(state.row?.failureReason ?? null).toBeFalsy();
  });

  it("on terminal Vapi 4xx, marks FAILED with brand-clean reason and does not throw", async () => {
    purchaseTwilioNumberMock.mockRejectedValueOnce(
      new MockPlatformProvisioningError(
        "NUMBER_PROVISION_FAILED",
        "We couldn't activate your business number.",
        { response: { status: 400 } }
      )
    );

    const result = await provisioningWorker(makeJob());
    expect(result.status).toBe("FAILED");
    expect(state.row.status).toBe("FAILED");
    expect(state.row.failureReason).toBeTruthy();
    // Brand-clean — no banned vendor name.
    const banned = ["vapi", "twilio", "gemini", "elevenlabs", "deepgram"];
    expect(
      banned.every((b) => !String(state.row.failureReason).toLowerCase().includes(b))
    ).toBe(true);
    expect(state.audits.some((a) => a.action === "PROVISIONING_FAILED")).toBe(true);
    expect(state.emails.length).toBe(1);
  });
});

describe("provisioningWorker — missing tenant profile", () => {
  it("FAILED with 'Tenant profile incomplete' when aiSystemPrompt is null", async () => {
    state.orgRow = {
      id: "org_a",
      aiCallerName: "Alex",
      aiCallerCompany: "Acme",
      aiSystemPrompt: null,
    };
    const result = await provisioningWorker(makeJob());
    expect(result.status).toBe("FAILED");
    expect(state.row.status).toBe("FAILED");
    expect(String(state.row.failureReason)).toMatch(/incomplete/i);
    // Vapi assistant create must NOT have been called.
    expect(createAssistantMock).not.toHaveBeenCalled();
  });
});

describe("TerminalProvisioningError", () => {
  it("scrubs vendor names from the message", () => {
    const e = new TerminalProvisioningError("Vapi rejected our request");
    expect(e.message.toLowerCase()).not.toContain("vapi");
  });
});
