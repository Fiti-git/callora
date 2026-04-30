import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M7 — low-balance alert engine.
 *
 * Decision tree we lock in here:
 *   - balance above threshold → silent
 *   - autoRechargeEnabled=true → silent (auto-recharge owns comms)
 *   - within 24h debounce → silent
 *   - first-cross + auto-recharge OFF → email + lowBalanceAlertSentAt set
 *   - errors swallowed (debit path must never fail)
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.PAYG_LOW_BALANCE_ALERT_CENTS ||= "1000";
process.env.NODE_ENV = "test";

let ledger: any = null;
const ledgerUpdates: any[] = [];
const emails: any[] = [];

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
    organization: {
      findUnique: vi.fn(async () => ({
        id: "org_a",
        users: [{ email: "admin@x.com", name: "Admin", role: "ADMIN" }],
      })),
    },
  },
}));

vi.mock("../lib/email.js", () => ({
  APP_URL: "http://localhost:3000",
  sendEmail: async (to: string, subject: string, html: string, opts?: any) => {
    emails.push({ to, subject, html, opts });
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
  ledgerUpdates.length = 0;
  emails.length = 0;
});

describe("maybeSendLowBalanceAlert", () => {
  it("no-op when balance above threshold (cheap exit, no DB hit)", async () => {
    ledger = null;
    const { maybeSendLowBalanceAlert } = await import("../lib/lowBalanceAlert.js");
    await maybeSendLowBalanceAlert("org_a", 5000);
    expect(emails.length).toBe(0);
    expect(ledgerUpdates.length).toBe(0);
  });

  it("no-op when ledger row missing", async () => {
    ledger = null;
    const { maybeSendLowBalanceAlert } = await import("../lib/lowBalanceAlert.js");
    await maybeSendLowBalanceAlert("org_a", 500);
    expect(emails.length).toBe(0);
  });

  it("no-op when autoRechargeEnabled=true (auto-recharge owns comms)", async () => {
    ledger = {
      autoRechargeEnabled: true,
      lowBalanceAlertSentAt: null,
    };
    const { maybeSendLowBalanceAlert } = await import("../lib/lowBalanceAlert.js");
    await maybeSendLowBalanceAlert("org_a", 500);
    expect(emails.length).toBe(0);
    expect(ledgerUpdates.length).toBe(0);
  });

  it("no-op when last alert was within 24h debounce window", async () => {
    ledger = {
      autoRechargeEnabled: false,
      lowBalanceAlertSentAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    };
    const { maybeSendLowBalanceAlert } = await import("../lib/lowBalanceAlert.js");
    await maybeSendLowBalanceAlert("org_a", 500);
    expect(emails.length).toBe(0);
  });

  it("sends email + sets lowBalanceAlertSentAt on first cross with auto-recharge off", async () => {
    ledger = {
      autoRechargeEnabled: false,
      lowBalanceAlertSentAt: null,
    };
    const { maybeSendLowBalanceAlert } = await import("../lib/lowBalanceAlert.js");
    await maybeSendLowBalanceAlert("org_a", 750);

    expect(emails.length).toBe(1);
    expect(emails[0].to).toBe("admin@x.com");
    expect(emails[0].subject).toMatch(/credits/i);
    expect(emails[0].opts?.template).toBe("LOW_BALANCE_ALERT");
    expect(emails[0].opts?.required).toBe(false);
    expect(ledgerUpdates.find((u) => u.lowBalanceAlertSentAt instanceof Date)).toBeTruthy();
  });

  it("sends again when last alert was older than 24h", async () => {
    ledger = {
      autoRechargeEnabled: false,
      lowBalanceAlertSentAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago
    };
    const { maybeSendLowBalanceAlert } = await import("../lib/lowBalanceAlert.js");
    await maybeSendLowBalanceAlert("org_a", 200);
    expect(emails.length).toBe(1);
  });
});
