import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M2 — auto-recharge engine.
 *
 * The engine is called with `(orgId, balanceAfterCents)` from M5's debit
 * path. We verify the decision tree:
 *  - above-threshold → no charge
 *  - below + enabled + has-card → fires chargeTopUp
 *  - below + no card → disables + sends email
 *  - debounce within 5 min → no charge
 *  - declined card → disables + email + audit AUTO_RECHARGE_FAILED
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";

let ledger: any = null;
let provisioning: any = null;
const ledgerUpdates: any[] = [];
const audits: any[] = [];
const emails: any[] = [];

const chargeTopUpMock = vi.fn();

vi.mock("../services/stripeBilling.js", () => ({
  chargeTopUp: (...args: any[]) => chargeTopUpMock(...args),
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    creditLedger: {
      findUnique: vi.fn(async () => ledger),
      update: vi.fn(async ({ data }: any) => {
        ledgerUpdates.push(data);
        ledger = { ...ledger, ...data };
        return ledger;
      }),
    },
    tenantProvisioning: {
      findUnique: vi.fn(async () => provisioning),
    },
    organization: {
      findUnique: vi.fn(async () => ({
        id: "org_a",
        users: [{ email: "admin@x.com", name: "Admin", role: "ADMIN" }],
      })),
    },
  },
}));

vi.mock("../lib/audit.js", () => ({
  writeAudit: async (a: any) => {
    audits.push(a);
  },
}));

vi.mock("../lib/email.js", () => ({
  APP_URL: "http://localhost:3000",
  sendEmail: async (to: string, subject: string) => {
    emails.push({ to, subject });
  },
}));

vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
  sentryEnabled: false,
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  ledger = null;
  provisioning = null;
  ledgerUpdates.length = 0;
  audits.length = 0;
  emails.length = 0;
  chargeTopUpMock.mockReset();
});

describe("maybeAutoRecharge", () => {
  it("no-op when balance above threshold", async () => {
    ledger = {
      autoRechargeEnabled: true,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 2500,
      lastAutoRechargeAt: null,
    };
    const { maybeAutoRecharge } = await import("../lib/creditAutoRecharge.js");
    await maybeAutoRecharge("org_a", 5000);
    expect(chargeTopUpMock).not.toHaveBeenCalled();
  });

  it("no-op when autoRechargeEnabled=false", async () => {
    ledger = {
      autoRechargeEnabled: false,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 2500,
      lastAutoRechargeAt: null,
    };
    const { maybeAutoRecharge } = await import("../lib/creditAutoRecharge.js");
    await maybeAutoRecharge("org_a", 100);
    expect(chargeTopUpMock).not.toHaveBeenCalled();
  });

  it("fires chargeTopUp when below + enabled + has-card", async () => {
    ledger = {
      autoRechargeEnabled: true,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 2500,
      lastAutoRechargeAt: null,
    };
    provisioning = { defaultPaymentMethodId: "pm_x" };
    chargeTopUpMock.mockResolvedValue({ paymentIntentId: "pi_1", status: "succeeded" });

    const { maybeAutoRecharge } = await import("../lib/creditAutoRecharge.js");
    await maybeAutoRecharge("org_a", 500);

    expect(chargeTopUpMock).toHaveBeenCalledTimes(1);
    const [orgId, amount, opts] = chargeTopUpMock.mock.calls[0];
    expect(orgId).toBe("org_a");
    expect(amount).toBe(2500);
    expect(opts.source).toBe("AUTO_RECHARGE");
    expect(opts.idempotencyKey).toMatch(/^auto-org_a-\d{4}-\d{2}-\d{2}$/);
    expect(audits.find((a) => a.action === "AUTO_RECHARGE_FIRED")).toBeTruthy();
    expect(ledgerUpdates.find((u) => u.lastAutoRechargeAt instanceof Date)).toBeTruthy();
  });

  it("disables + emails when no card on file", async () => {
    ledger = {
      autoRechargeEnabled: true,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 2500,
      lastAutoRechargeAt: null,
    };
    provisioning = { defaultPaymentMethodId: null };
    const { maybeAutoRecharge } = await import("../lib/creditAutoRecharge.js");
    await maybeAutoRecharge("org_a", 200);

    expect(chargeTopUpMock).not.toHaveBeenCalled();
    expect(ledgerUpdates.find((u) => u.autoRechargeEnabled === false)).toBeTruthy();
    expect(emails.length).toBe(1);
    expect(audits.find((a) => a.action === "AUTO_RECHARGE_DISABLED_NO_CARD")).toBeTruthy();
  });

  it("debounces within 5 minutes", async () => {
    ledger = {
      autoRechargeEnabled: true,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 2500,
      lastAutoRechargeAt: new Date(Date.now() - 60_000), // 1 min ago
    };
    provisioning = { defaultPaymentMethodId: "pm_x" };
    const { maybeAutoRecharge } = await import("../lib/creditAutoRecharge.js");
    await maybeAutoRecharge("org_a", 500);
    expect(chargeTopUpMock).not.toHaveBeenCalled();
  });

  it("disables + emails + audits AUTO_RECHARGE_FAILED on declined card", async () => {
    ledger = {
      autoRechargeEnabled: true,
      autoRechargeThresholdCents: 1000,
      autoRechargeAmountCents: 2500,
      lastAutoRechargeAt: null,
    };
    provisioning = { defaultPaymentMethodId: "pm_x" };
    chargeTopUpMock.mockRejectedValue(
      Object.assign(new Error("Your card was declined"), { code: "card_declined" })
    );

    const { maybeAutoRecharge } = await import("../lib/creditAutoRecharge.js");
    await maybeAutoRecharge("org_a", 500);

    expect(chargeTopUpMock).toHaveBeenCalledTimes(1);
    expect(ledgerUpdates.find((u) => u.autoRechargeEnabled === false)).toBeTruthy();
    expect(emails.length).toBe(1);
    expect(audits.find((a) => a.action === "AUTO_RECHARGE_FAILED")).toBeTruthy();
  });
});
