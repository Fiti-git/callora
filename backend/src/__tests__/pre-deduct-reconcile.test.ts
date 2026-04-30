import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M5 — reconcileCallCost.
 *
 * Verifies the pre-deduct + reconcile dance for Vapi calls:
 *   pre-deducted 150 raw → 195 marked
 *   actual 80 raw → 104 marked → ADJUSTMENT credit of 91
 *   actual 200 raw → 260 marked → additional DEBIT_CALL of 65
 *   actual == pre → no-op
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth";
process.env.PLATFORM_JWT_SECRET ||= "test-platform";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.PAYG_MARKUP_PCT ||= "30";
process.env.NODE_ENV = "test";

const txInserted: any[] = [];
let ledger: any = {
  id: "ld_1",
  organizationId: "org_a",
  balanceCents: 100000,
  lifetimeAddedCents: 100000,
  lifetimeSpentCents: 0,
};

vi.mock("../lib/prisma.js", () => {
  const tx: any = {
    creditLedger: {
      upsert: vi.fn(async () => ledger),
      update: vi.fn(async ({ data }: any) => {
        if (data.balanceCents?.decrement != null) {
          ledger.balanceCents -= data.balanceCents.decrement;
        } else if (data.balanceCents?.increment != null) {
          ledger.balanceCents += data.balanceCents.increment;
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
      organization: { findUnique: vi.fn(async () => ({ billingMode: "PAYG" })) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
  };
});

vi.mock("../lib/creditAutoRecharge.js", () => ({
  maybeAutoRecharge: vi.fn(async () => undefined),
}));
vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException: vi.fn() },
  sentryEnabled: false,
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  txInserted.length = 0;
  ledger = {
    id: "ld_1",
    organizationId: "org_a",
    balanceCents: 100000,
    lifetimeAddedCents: 100000,
    lifetimeSpentCents: 0,
  };
});

describe("reconcileCallCost", () => {
  it("actual < pre-deducted → ADJUSTMENT credit for the difference", async () => {
    const { reconcileCallCost } = await import("../lib/paygDebit.js");
    // pre 150 → marked 195; actual 80 → marked 104; delta = 104 - 195 = -91
    const r = await reconcileCallCost("org_a", 150, 80, "vapi_1");
    expect(r.skipped).toBe(false);
    expect(r.delta).toBe(-91);
    expect(txInserted.length).toBe(1);
    expect(txInserted[0].kind).toBe("ADJUSTMENT");
    expect(txInserted[0].amountCents).toBe(91);
  });

  it("actual > pre-deducted → additional DEBIT_CALL for the extra", async () => {
    const { reconcileCallCost } = await import("../lib/paygDebit.js");
    // pre 150 → 195; actual 200 → 260; delta = 65
    const r = await reconcileCallCost("org_a", 150, 200, "vapi_2");
    expect(r.skipped).toBe(false);
    expect(r.delta).toBe(65);
    expect(txInserted.length).toBe(1);
    expect(txInserted[0].kind).toBe("DEBIT_CALL");
    expect(txInserted[0].amountCents).toBe(-65);
  });

  it("actual == pre-deducted → no-op", async () => {
    const { reconcileCallCost } = await import("../lib/paygDebit.js");
    const r = await reconcileCallCost("org_a", 150, 150, "vapi_3");
    expect(r.skipped).toBe(true);
    expect(txInserted.length).toBe(0);
  });
});
