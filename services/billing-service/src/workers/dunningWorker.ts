import type { Job } from "bullmq";
import { prisma, logger } from "@callora/shared";
import { ensureStripe } from "../services/stripe.js";
import {
  decideTransition,
  shouldRetryCharge,
  type DunningRowMinimal,
  type RetryOutcome,
  type DunningEmailKey,
} from "../lib/dunning.js";

const BATCH_SIZE = 50;
const NOTIFICATION_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://notification-service:4008";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Hourly dunning tick — advances DunningState rows whose nextActionAt is due.
 * Decision logic lives in `lib/dunning.ts::decideTransition` so it can be
 * unit tested without the worker harness.
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
      await processOneDunningRow(row as any);
      processed++;
    } catch (err) {
      logger.error(
        { err, dunningId: row.id, invoiceId: row.invoiceId },
        "[dunning] failed to process row"
      );
    }
  }

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

export async function processOneDunningRow(
  row: DunningRowMinimal & {
    subscriptionId?: string | null;
    amountDueCents?: number | null;
    currency?: string | null;
  }
): Promise<void> {
  let retry: RetryOutcome = "SKIPPED";
  if (shouldRetryCharge(row)) {
    retry = await tryStripeInvoicePay(row.invoiceId);
  }

  const decision = decideTransition(row, retry);

  if (decision.cancelStripeSubscription && row.subscriptionId) {
    try {
      const s = await ensureStripe();
      await s.subscriptions.cancel(row.subscriptionId);
    } catch (err) {
      logger.error(
        { err, subscriptionId: row.subscriptionId },
        "[dunning] stripe.subscriptions.cancel failed (continuing)"
      );
    }
  }

  const nextActionAt =
    decision.nextActionDeltaMs == null
      ? row.status === "RESOLVED" || row.status === "CANCELED"
        ? new Date()
        : new Date(Date.now() + 365 * 86_400_000)
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

  if (decision.emailKey) {
    await sendDunningEmail(row.organizationId, decision.emailKey).catch((err) => {
      logger.error(
        { err, orgId: row.organizationId, emailKey: decision.emailKey },
        "[dunning] email send failed (non-fatal)"
      );
    });
  }

  // AuditLog write — billing-service uses prisma directly.
  try {
    await prisma.auditLog.create({
      data: {
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
        } as any,
      },
    });
  } catch (err) {
    logger.error({ err }, "[dunning] auditLog write failed");
  }
}

async function tryStripeInvoicePay(invoiceId: string): Promise<RetryOutcome> {
  try {
    const s = await ensureStripe();
    const inv = await s.invoices.pay(invoiceId);
    if (inv.status === "paid") return "SUCCEEDED";
    return "FAILED";
  } catch (err) {
    logger.warn({ err, invoiceId }, "[dunning] stripe.invoices.pay failed");
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

  // POST to notification-service /internal/send-email with the dunning template.
  try {
    const res = await fetch(`${NOTIFICATION_URL}/internal/send-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        template: "dunning",
        to: admin.email,
        organizationId,
        required: false,
        data: {
          key,
          name: admin.name ?? "",
          billingUrl: `${APP_URL}/billing/dunning`,
        },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, body: txt.slice(0, 500), key },
        "[dunning] notification-service returned non-2xx"
      );
    }
  } catch (err) {
    logger.error({ err, key }, "[dunning] failed to call notification-service");
  }
}
