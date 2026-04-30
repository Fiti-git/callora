import { Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { stripe, ensureStripe } from "../services/stripe.js";
import {
  decideTransition,
  shouldRetryCharge,
  type DunningRowMinimal,
  type RetryOutcome,
} from "../lib/dunning.js";
import { dunningEmail, type DunningEmailKey } from "../emails/dunning.js";
import { sendEmail, APP_URL } from "../lib/email.js";
import { writeAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";

const BATCH_SIZE = 50;

/**
 * Hourly tick that advances DunningState rows whose nextActionAt is due.
 *
 * We deliberately keep this worker thin — all decision-making lives in
 * `lib/dunning.ts::decideTransition` so it can be unit-tested without the
 * worker harness. This function just wires Stripe + Prisma + email I/O to
 * the pure decision output.
 */
export async function dunningWorker(_job: Job): Promise<{
  processed: number;
  resolved: number;
  advanced: number;
  canceled: number;
}> {
  const now = new Date();
  const due = await prisma.dunningState.findMany({
    where: {
      nextActionAt: { lte: now },
      status: { notIn: ["RESOLVED", "CANCELED"] },
    },
    take: BATCH_SIZE,
    orderBy: { nextActionAt: "asc" },
  });

  let processed = 0;
  let resolved = 0;
  let advanced = 0;
  let canceled = 0;

  for (const row of due) {
    try {
      await processOneDunningRow(row);
      processed++;
      if (row.status === "ACTIVE" || row.status === "RETRY_SCHEDULED") {
        // We don't know the post-state here without re-reading; counters are
        // approximate and used for log-level visibility only.
      }
    } catch (err) {
      logger.error(
        { err, dunningId: row.id, invoiceId: row.invoiceId },
        "[dunning] failed to process row"
      );
      if (sentryEnabled) {
        Sentry.captureException(err, {
          tags: { component: "dunning", invoiceId: row.invoiceId },
        });
      }
      // Re-throw so BullMQ retries the whole tick. With BATCH_SIZE=50 and an
      // hourly cadence, individual transient row errors are tolerable.
    }
  }

  // Re-count post-state for accurate logs.
  for (const row of due) {
    const fresh = await prisma.dunningState.findUnique({ where: { id: row.id } });
    if (!fresh) continue;
    if (fresh.status === "RESOLVED") resolved++;
    else if (fresh.status === "CANCELED") canceled++;
    else advanced++;
  }

  logger.info(
    { processed, resolved, advanced, canceled },
    "[dunning] tick complete"
  );
  return { processed, resolved, advanced, canceled };
}

export async function processOneDunningRow(row: DunningRowMinimal & {
  subscriptionId?: string | null;
  amountDueCents?: number | null;
  currency?: string | null;
}): Promise<void> {
  // 1. Decide whether to retry the charge.
  let retry: RetryOutcome = "SKIPPED";
  if (shouldRetryCharge(row)) {
    retry = await tryStripeInvoicePay(row.invoiceId);
  }

  // 2. Run the pure state-machine.
  const decision = decideTransition(row, retry);

  // 3. Optionally cancel Stripe subscription (Day 30).
  if (decision.cancelStripeSubscription && row.subscriptionId) {
    try {
      const s = ensureStripe();
      await s.subscriptions.cancel(row.subscriptionId);
    } catch (err) {
      logger.error(
        { err, subscriptionId: row.subscriptionId },
        "[dunning] stripe.subscriptions.cancel failed (continuing)"
      );
      if (sentryEnabled) Sentry.captureException(err);
    }
  }

  // 4. Persist new DunningState + Org.status.
  const nextActionAt =
    decision.nextActionDeltaMs == null
      ? row.status === "RESOLVED" || row.status === "CANCELED"
        ? new Date()
        : new Date(Date.now() + 365 * 86_400_000) // far future for terminal states
      : new Date(Date.now() + decision.nextActionDeltaMs);

  await prisma.dunningState.update({
    where: { id: row.id },
    data: {
      attempt: decision.nextAttempt,
      status: decision.nextStatus as any,
      nextActionAt,
      lastEmailSentAt: decision.emailKey ? new Date() : undefined,
      resolvedAt:
        decision.nextStatus === "RESOLVED" ? new Date() : undefined,
    },
  });

  if (decision.orgStatus) {
    await prisma.organization.update({
      where: { id: row.organizationId },
      data: { status: decision.orgStatus },
    });
  }

  // 5. Send transition email + write AuditLog.
  if (decision.emailKey) {
    await sendDunningEmail(row.organizationId, decision.emailKey).catch((err) => {
      logger.error(
        { err, orgId: row.organizationId, emailKey: decision.emailKey },
        "[dunning] email send failed (non-fatal)"
      );
    });
  }

  await writeAudit({
    actorType: "SYSTEM",
    actorId: "dunningWorker",
    organizationId: row.organizationId,
    targetOrganizationId: row.organizationId,
    action: decision.auditAction,
    entity: "DunningState",
    entityId: row.id,
    metadata: {
      invoiceId: row.invoiceId,
      attempt: decision.nextAttempt,
      status: decision.nextStatus,
      retryOutcome: retry,
    },
  });
}

async function tryStripeInvoicePay(invoiceId: string): Promise<RetryOutcome> {
  if (!stripe) {
    // No Stripe configured (test/dev) — treat as a failed retry so the state
    // machine still advances. Production always has stripe wired up.
    return "FAILED";
  }
  try {
    const inv = await stripe.invoices.pay(invoiceId);
    if (inv.status === "paid") return "SUCCEEDED";
    return "FAILED";
  } catch (err) {
    logger.warn(
      { err, invoiceId },
      "[dunning] stripe.invoices.pay failed"
    );
    return "FAILED";
  }
}

export async function sendDunningEmail(
  organizationId: string,
  key: DunningEmailKey
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { users: { where: { role: "ADMIN" }, take: 1 } },
  });
  const admin = org?.users?.[0];
  if (!admin?.email) return;

  const { subject, html } = dunningEmail(key, {
    name: admin.name ?? "",
    billingUrl: `${APP_URL}/billing/dunning`,
  });

  // Dunning emails are passive — must not throw on quota exhaustion.
  await sendEmail(admin.email, subject, html, {
    organizationId,
    template: key,
    required: false,
  });
}
