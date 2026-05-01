// Mirror of DunningEmailKey from notification-service/src/emails/dunning.ts.
// Duplicated to avoid a cross-service compile-time dependency.
export type DunningEmailKey =
  | "DUNNING_DAY_0_FAILED"
  | "DUNNING_DAY_3_RETRY_FAILED"
  | "DUNNING_DAY_7_FINAL_WARNING"
  | "DUNNING_DAY_10_SUSPENDED"
  | "DUNNING_DAY_30_CANCELED"
  | "DUNNING_RECOVERED";

/**
 * Dunning state-machine cadence.
 *
 *  Day 0  — invoice.payment_failed webhook lands.
 *           Upsert DunningState(attempt=1, status=ACTIVE, nextActionAt=+3d).
 *           Send DUNNING_DAY_0_FAILED. Org -> PAST_DUE.
 *
 *  Day 3  — worker tick on (attempt=1, ACTIVE). Retry stripe.invoices.pay.
 *           Success -> RESOLVED. Failure -> RETRY_SCHEDULED, +4d.
 *
 *  Day 7  — worker tick on (attempt=2, RETRY_SCHEDULED). Retry pay.
 *           Success -> RESOLVED. Failure -> WARNED, +3d.
 *
 *  Day 10 — worker tick on (attempt=3, WARNED). Org=SUSPENDED, +20d.
 *
 *  Day 30 — worker tick on (attempt>=4, SUSPENDED). Cancel Stripe sub,
 *           Org=CANCELED.
 *
 * Decision logic is decoupled from Prisma + Stripe I/O so it can be unit
 * tested without external services.
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
  nextAttempt: number;
  nextStatus: DunningRowMinimal["status"];
  nextActionDeltaMs: number | null;
  orgStatus: "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED" | null;
  emailKey: DunningEmailKey | null;
  auditAction: string;
  cancelStripeSubscription: boolean;
}

const DAY = 86_400_000;

export function decideTransition(
  row: DunningRowMinimal,
  retry: RetryOutcome
): Transition {
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

  if (row.status === "ACTIVE" && row.attempt === 1) {
    return {
      nextAttempt: 2,
      nextStatus: "RETRY_SCHEDULED",
      nextActionDeltaMs: 4 * DAY,
      orgStatus: null,
      emailKey: "DUNNING_DAY_3_RETRY_FAILED",
      auditAction: "DUNNING_RETRY_FAILED",
      cancelStripeSubscription: false,
    };
  }

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

export function shouldRetryCharge(row: DunningRowMinimal): boolean {
  if (row.status === "ACTIVE" && row.attempt === 1) return true;
  if (row.status === "RETRY_SCHEDULED" && row.attempt === 2) return true;
  return false;
}

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
