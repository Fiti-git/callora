/**
 * Phase 5 Agent M5 — PAYG ledger debit.
 *
 * Single atomic helper for charging consumed usage against the org's PAYG
 * CreditLedger. Applies PAYG_MARKUP_PCT and writes an immutable
 * CreditTransaction in the same transaction as the ledger update.
 *
 * Skips entirely for BYOK / SUBSCRIPTION orgs — they don't use the ledger.
 *
 * After a successful debit, fires `maybeAutoRecharge` (fire-and-forget) so
 * the next debit doesn't trip a starved-balance check.
 */
import prisma from "./prisma.js";
import { requireEnv } from "./env.js";
import { Sentry, sentryEnabled } from "./sentry.js";
import { logger } from "./logger.js";
import { maybeAutoRecharge } from "./creditAutoRecharge.js";
import { maybeSendLowBalanceAlert } from "./lowBalanceAlert.js";

export type DebitKind =
  | "DEBIT_CALL"
  | "DEBIT_QUALIFICATION"
  | "DEBIT_DISCOVERY"
  | "DEBIT_EMAIL"
  | "ADJUSTMENT";

export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS" as const;
  readonly status = 402 as const;
  readonly required: number;
  readonly current: number;
  constructor(required: number, current: number) {
    super(
      `Insufficient credits: required=${required} cents, available=${current} cents`
    );
    this.name = "InsufficientCreditsError";
    this.required = required;
    this.current = current;
  }
}

/**
 * Compute the marked-up debit amount in cents. Markup pct is read from env
 * once (no per-call env validation cost — env.ts already requireEnv'd it
 * at boot).
 */
export function applyMarkup(rawCostCents: number): number {
  const pct = Number(requireEnv("PAYG_MARKUP_PCT"));
  if (!Number.isFinite(pct) || pct < 0) {
    // Treat malformed config as 0% — fail loud via Sentry so we notice.
    if (sentryEnabled) {
      Sentry.captureException(new Error("PAYG_MARKUP_PCT is not a finite number"));
    }
    return Math.ceil(rawCostCents);
  }
  return Math.ceil(rawCostCents * (1 + pct / 100));
}

interface DebitOptions {
  /** Optional raw insert into CreditTransaction.kind. Lets ADJUSTMENT etc.
   *  reuse this helper. */
  kindOverride?: string;
  /** Skip the markup (used for ADJUSTMENT / reconcile rows). */
  skipMarkup?: boolean;
  /** Allow a positive (credit) amount instead of a debit. Used by the
   *  call-cost reconciliation step when actual cost < pre-deducted estimate. */
  asCredit?: boolean;
}

/**
 * Atomic ledger debit. Returns the post-debit balance and the inserted
 * CreditTransaction id. Throws InsufficientCreditsError if the org's PAYG
 * balance can't cover `rawCostCents` post-markup.
 *
 * BYOK / SUBSCRIPTION orgs are skipped silently — they don't have a PAYG
 * ledger to debit. The function still returns shape-compatible data so
 * callers don't need a separate code path.
 */
export async function debitWithMarkup(
  organizationId: string,
  kind: DebitKind,
  rawCostCents: number,
  ref?: string,
  metadata?: Record<string, unknown>,
  options: DebitOptions = {}
): Promise<{ balanceAfterCents: number; skipped: boolean; transactionId?: string }> {
  if (rawCostCents <= 0 && !options.asCredit) {
    return { balanceAfterCents: 0, skipped: true };
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { billingMode: true },
  });
  if (!org) return { balanceAfterCents: 0, skipped: true };
  if (org.billingMode !== "PAYG") {
    return { balanceAfterCents: 0, skipped: true };
  }

  const amountAbs = options.skipMarkup
    ? Math.ceil(rawCostCents)
    : applyMarkup(rawCostCents);
  // Negative for debit, positive for credit (asCredit refunds / reconciliation).
  const signedAmount = options.asCredit ? amountAbs : -amountAbs;

  let balanceAfterCents = 0;
  let transactionId: string | undefined;

  await prisma.$transaction(async (tx) => {
    const ledger = await tx.creditLedger.upsert({
      where: { organizationId },
      create: {
        organizationId,
        balanceCents: 0,
        lifetimeAddedCents: 0,
        lifetimeSpentCents: 0,
      },
      update: {},
    });

    if (!options.asCredit && ledger.balanceCents < amountAbs) {
      throw new InsufficientCreditsError(amountAbs, ledger.balanceCents);
    }

    const updated = await tx.creditLedger.update({
      where: { organizationId },
      data: options.asCredit
        ? {
            balanceCents: { increment: amountAbs },
            lifetimeAddedCents: { increment: amountAbs },
          }
        : {
            balanceCents: { decrement: amountAbs },
            lifetimeSpentCents: { increment: amountAbs },
          },
    });
    balanceAfterCents = updated.balanceCents;

    const created = await tx.creditTransaction.create({
      data: {
        ledgerId: ledger.id,
        organizationId,
        kind: options.kindOverride ?? kind,
        amountCents: signedAmount,
        balanceAfterCents,
        ref: ref ?? null,
        metadata: metadata as any,
      },
    });
    transactionId = created.id;
  });

  // Fire-and-forget auto-recharge. Only fires on debits (asCredit means we
  // just topped up — let the webhook pathway handle recharge bookkeeping).
  if (!options.asCredit) {
    Promise.resolve()
      .then(() => maybeAutoRecharge(organizationId, balanceAfterCents))
      .catch((err) => {
        logger.warn(
          { err, organizationId },
          "[paygDebit] maybeAutoRecharge failed (non-fatal)"
        );
      });
    // Independent low-balance alert. Auto-recharge handles the loud
    // "card declined" path; this one fires only when the customer has
    // turned auto-recharge OFF and their balance dips. See
    // lowBalanceAlert.ts for the gate logic + 24h debounce.
    Promise.resolve()
      .then(() => maybeSendLowBalanceAlert(organizationId, balanceAfterCents))
      .catch((err) => {
        logger.warn(
          { err, organizationId },
          "[paygDebit] maybeSendLowBalanceAlert failed (non-fatal)"
        );
      });
  }

  return { balanceAfterCents, skipped: false, transactionId };
}

/**
 * Reconcile a placeholder pre-deduction (e.g. $1.50 reserved before a Vapi
 * call) against the actual webhook cost. Issues an ADJUSTMENT credit for
 * the difference if actual < pre-deducted, or an additional DEBIT_CALL if
 * actual > pre-deducted. No-op if equal.
 */
export async function reconcileCallCost(
  organizationId: string,
  preDeductedRawCents: number,
  actualRawCents: number,
  ref: string,
  metadata?: Record<string, unknown>
): Promise<{ balanceAfterCents: number; delta: number; skipped: boolean }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { billingMode: true },
  });
  if (!org || org.billingMode !== "PAYG") {
    return { balanceAfterCents: 0, delta: 0, skipped: true };
  }

  const preMarked = applyMarkup(preDeductedRawCents);
  const actualMarked = applyMarkup(actualRawCents);
  const delta = actualMarked - preMarked;

  if (delta === 0) {
    return { balanceAfterCents: 0, delta: 0, skipped: true };
  }
  if (delta < 0) {
    // Pre-deducted too much — refund the difference.
    const refundAbs = Math.abs(delta);
    const result = await debitWithMarkup(
      organizationId,
      "ADJUSTMENT",
      refundAbs,
      ref,
      { ...metadata, reconcileType: "REFUND" },
      { skipMarkup: true, asCredit: true, kindOverride: "ADJUSTMENT" }
    );
    return { balanceAfterCents: result.balanceAfterCents, delta, skipped: false };
  }
  // delta > 0 — pre-deducted too little, debit the extra.
  const result = await debitWithMarkup(
    organizationId,
    "DEBIT_CALL",
    delta,
    ref,
    { ...metadata, reconcileType: "ADDITIONAL_DEBIT" },
    { skipMarkup: true }
  );
  return { balanceAfterCents: result.balanceAfterCents, delta, skipped: false };
}
