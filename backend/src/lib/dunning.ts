import type { DunningEmailKey } from "../emails/dunning.js";

/**
 * Dunning state-machine cadence (Phase 2 Agent 8).
 *
 *  Day 0  — invoice.payment_failed webhook lands.
 *           Upsert DunningState(attempt=1, status=ACTIVE, nextActionAt=+3d).
 *           Send DUNNING_DAY_0_FAILED. Org → PAST_DUE.
 *
 *  Day 3  — worker tick on (attempt=1, ACTIVE).
 *           Try stripe.invoices.pay(invoiceId).
 *           If success → status=RESOLVED, org=ACTIVE, send DUNNING_RECOVERED.
 *           If failure → attempt=2, status=RETRY_SCHEDULED, nextActionAt=+4d,
 *           send DUNNING_DAY_3_RETRY_FAILED.
 *
 *  Day 7  — worker tick on (attempt=2, RETRY_SCHEDULED).
 *           Try stripe.invoices.pay again.
 *           If success → RESOLVED.
 *           If failure → attempt=3, status=WARNED, nextActionAt=+3d,
 *           send DUNNING_DAY_7_FINAL_WARNING.
 *
 *  Day 10 — worker tick on (attempt=3, WARNED).
 *           Org.status=SUSPENDED, status=SUSPENDED, nextActionAt=+20d,
 *           send DUNNING_DAY_10_SUSPENDED.
 *
 *  Day 30 — worker tick on (attempt>=4, SUSPENDED).
 *           stripe.subscriptions.cancel, org.status=CANCELED, status=CANCELED,
 *           send DUNNING_DAY_30_CANCELED.
 *
 *  Anytime — invoice.payment_succeeded webhook lands while a DunningState is
 *           open → mark RESOLVED, org→ACTIVE, send DUNNING_RECOVERED.
 *
 * The state-machine logic is intentionally decoupled from Prisma + Stripe
 * I/O so it can be unit-tested without a DB or HTTP. `decideTransition()`
 * takes the current row + retry outcome and returns the next state plus
 * which email to send and what AuditLog action to write.
 */

export type DunningRowMinimal = {
  id: string;
  organizationId: string;
  invoiceId: string;
  attempt: number;
  status:
    | "ACTIVE"
    | "RETRY_SCHEDULED"
    | "WARNED"
    | "SUSPENDED"
    | "RESOLVED"
    | "CANCELED";
};

export type RetryOutcome = "SUCCEEDED" | "FAILED" | "SKIPPED";

export interface Transition {
  /** New attempt counter to write. */
  nextAttempt: number;
  /** New status enum value. */
  nextStatus: DunningRowMinimal["status"];
  /** ms offset from now() to schedule next worker action. null = no further action. */
  nextActionDeltaMs: number | null;
  /** Org.status side-effect. null = no change. */
  orgStatus: "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED" | null;
  /** Email template key to send. null = no email. */
  emailKey: DunningEmailKey | null;
  /** Audit action string. */
  auditAction: string;
  /** True iff the worker should call stripe.subscriptions.cancel(). */
  cancelStripeSubscription: boolean;
}

const DAY = 86_400_000;

/**
 * Compute the next state for a DunningState row given the current row + the
 * outcome of the retry attempt the worker just made (or "SKIPPED" if the
 * worker decided not to retry, e.g. the SUSPEND/CANCEL transitions).
 */
export function decideTransition(
  row: DunningRowMinimal,
  retry: RetryOutcome
): Transition {
  // Successful retry collapses any state to RESOLVED.
  if (retry === "SUCCEEDED") {
    return {
      nextAttempt: row.attempt,
      nextStatus: "RESOLVED",
      nextActionDeltaMs: null,
      orgStatus: "ACTIVE",
      emailKey: "DUNNING_RECOVERED",
      auditAction: "DUNNING_RESOLVED",
      cancelStripeSubscription: false,
    };
  }

  // Day 3 — first retry failed.
  if (row.status === "ACTIVE" && row.attempt === 1) {
    return {
      nextAttempt: 2,
      nextStatus: "RETRY_SCHEDULED",
      nextActionDeltaMs: 4 * DAY,
      orgStatus: null, // already PAST_DUE from Day 0
      emailKey: "DUNNING_DAY_3_RETRY_FAILED",
      auditAction: "DUNNING_RETRY_FAILED",
      cancelStripeSubscription: false,
    };
  }

  // Day 7 — second retry failed.
  if (row.status === "RETRY_SCHEDULED" && row.attempt === 2) {
    return {
      nextAttempt: 3,
      nextStatus: "WARNED",
      nextActionDeltaMs: 3 * DAY,
      orgStatus: null,
      emailKey: "DUNNING_DAY_7_FINAL_WARNING",
      auditAction: "DUNNING_WARNED",
      cancelStripeSubscription: false,
    };
  }

  // Day 10 — escalate to SUSPENDED.
  if (row.status === "WARNED" && row.attempt === 3) {
    return {
      nextAttempt: 4,
      nextStatus: "SUSPENDED",
      nextActionDeltaMs: 20 * DAY,
      orgStatus: "SUSPENDED",
      emailKey: "DUNNING_DAY_10_SUSPENDED",
      auditAction: "DUNNING_SUSPENDED",
      cancelStripeSubscription: false,
    };
  }

  // Day 30 — cancel the Stripe subscription + mark org CANCELED.
  if (row.status === "SUSPENDED" && row.attempt >= 4) {
    return {
      nextAttempt: row.attempt + 1,
      nextStatus: "CANCELED",
      nextActionDeltaMs: null,
      orgStatus: "CANCELED",
      emailKey: "DUNNING_DAY_30_CANCELED",
      auditAction: "DUNNING_CANCELED",
      cancelStripeSubscription: true,
    };
  }

  // Defensive fallthrough — already terminal, no-op.
  return {
    nextAttempt: row.attempt,
    nextStatus: row.status,
    nextActionDeltaMs: null,
    orgStatus: null,
    emailKey: null,
    auditAction: "DUNNING_NOOP",
    cancelStripeSubscription: false,
  };
}

/**
 * Should the worker actually try to charge the invoice for this row?
 * Day 3 and Day 7 retry; Day 10/30 do not (we've given up retrying).
 */
export function shouldRetryCharge(row: DunningRowMinimal): boolean {
  if (row.status === "ACTIVE" && row.attempt === 1) return true;
  if (row.status === "RETRY_SCHEDULED" && row.attempt === 2) return true;
  return false;
}

/**
 * Initial DunningState payload for an invoice.payment_failed event. Pass the
 * result to prisma.dunningState.upsert().
 */
export function initialDunningPayload(opts: {
  organizationId: string;
  invoiceId: string;
  subscriptionId?: string | null;
  amountDueCents?: number | null;
  currency?: string | null;
  now?: Date;
}) {
  const now = opts.now ?? new Date();
  return {
    organizationId: opts.organizationId,
    invoiceId: opts.invoiceId,
    subscriptionId: opts.subscriptionId ?? null,
    amountDueCents: opts.amountDueCents ?? null,
    currency: opts.currency ?? null,
    attempt: 1,
    status: "ACTIVE" as const,
    firstFailedAt: now,
    nextActionAt: new Date(now.getTime() + 3 * DAY),
    lastEmailSentAt: now,
  };
}
