import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M5 — debitWithMarkup.
 *
 * Verifies the PAYG-only gating and markup math. Prisma is fully mocked so
 * tests run without a DB.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth";
process.env.PLATFORM_JWT_SECRET ||= "test-platform";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.PAYG_MARKUP_PCT ||= "30";
process.env.PAYG_GEMINI_CENTS_PER_QUALIFICATION ||= "1";
process.env.PAYG_PLACES_CENTS_PER_SEARCH ||= "5";
process.env.PAYG_EMAIL_CENTS_PER_SEND ||= "1";
process.env.NODE_ENV = "test";

let billingMode: "PAYG" | "BYOK" | "SUBSCRIPTION" = "PAYG";
let ledger: any = null;
const txInserted: any[] = [];
const ledgerUpdates: any[] = [];
const autoRechargeCalls: any[] = [];

vi.mock("../lib/prisma.js", () => {
  const tx: any = {
    creditLedger: {
      upsert: vi.fn(async ({ create }: any) => {
        if (!ledger) ledger = { id: "ld_1", organizationId: create.organizationId, balanceCents: 0, lifetimeAddedCents: 0, lifetimeSpentCents: 0 };
        return ledger;
      }),
      update: vi.fn(async ({ data }: any) => {
        ledgerUpdates.push(data);
        if (data.balanceCents?.decrement != null) {
          ledger.balanceCents -= data.balanceCents.decrement;
          ledger.lifetimeSpentCents += data.lifetimeSpentCents.increment;
        } else if (data.balanceCents?.increment != null) {
          ledger.balanceCents += data.balanceCents.increment;
          ledger.lifetimeAddedCents += data.lifetimeAddedCents.increment;
        }
        return ledger;
      }),
    },
    creditTransaction: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `tx_${txInserted.length + 1}`, ...data };
        txInserted.push(row);
        return row;
      }),
    },
  };
  return {
    default: {
      organization: {
        findUnique: vi.fn(async () => ({ billingMode })),
      },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
  };
});

vi.mock("../lib/creditAutoRecharge.js", () => ({
  maybeAutoRecharge: vi.fn(async (orgId: string, balanceAfterCents: number) => {
    autoRechargeCalls.push({ orgId, balanceAfterCents });
  }),
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
  txInserted.length = 0;
  ledgerUpdates.length = 0;
  autoRechargeCalls.length = 0;
  billingMode = "PAYG";
});

describe("debitWithMarkup", () => {
  it("BYOK orgs are skipped — no ledger touch", async () => {
    billingMode = "BYOK";
    const { debitWithMarkup } = await import("../lib/paygDebit.js");
    const r = await debitWithMarkup("org_a", "DEBIT_CALL", 100, "ref-1");
    expect(r.skipped).toBe(true);
    expect(txInserted.length).toBe(0);
  });

  it("Subscription orgs are skipped", async () => {
    billingMode = "SUBSCRIPTION";
    const { debitWithMarkup } = await import("../lib/paygDebit.js");
    const r = await debitWithMarkup("org_a", "DEBIT_CALL", 100, "ref-2");
    expect(r.skipped).toBe(true);
  });

  it("PAYG: applies 30% markup, debits ledger, inserts CreditTransaction", async () => {
    ledger = {
      id: "ld_1",
      organizationId: "org_a",
      balanceCents: 1000,
      lifetimeAddedCents: 1000,
      lifetimeSpentCents: 0,
    };
    const { debitWithMarkup } = await import("../lib/paygDebit.js");
    const r = await debitWithMarkup("org_a", "DEBIT_CALL", 100, "vapi-call-1", {
      callLogId: "cl_1",
    });
    expect(r.skipped).toBe(false);
    // 100 * 1.30 = 130
    expect(r.balanceAfterCents).toBe(1000 - 130);
    expect(txInserted.length).toBe(1);
    expect(txInserted[0].kind).toBe("DEBIT_CALL");
    expect(txInserted[0].amountCents).toBe(-130);
    expect(txInserted[0].balanceAfterCents).toBe(870);
    // Auto-recharge fires (fire-and-forget). Wait a tick.
    await new Promise((res) => setImmediate(res));
    expect(autoRechargeCalls.length).toBe(1);
    expect(autoRechargeCalls[0]).toEqual({ orgId: "org_a", balanceAfterCents: 870 });
  });

  it("PAYG: insufficient credits throws InsufficientCreditsError", async () => {
    ledger = {
      id: "ld_1",
      organizationId: "org_a",
      balanceCents: 50,
      lifetimeAddedCents: 50,
      lifetimeSpentCents: 0,
    };
    const { debitWithMarkup, InsufficientCreditsError } = await import("../lib/paygDebit.js");
    await expect(
      debitWithMarkup("org_a", "DEBIT_CALL", 100, "ref-x")
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("applyMarkup respects PAYG_MARKUP_PCT", async () => {
    const { applyMarkup } = await import("../lib/paygDebit.js");
    expect(applyMarkup(100)).toBe(130);
    expect(applyMarkup(80)).toBe(104);
    expect(applyMarkup(0)).toBe(0);
  });
});
