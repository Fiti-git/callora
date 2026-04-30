/**
 * Phase 5 Agent M2 — Auto-recharge engine.
 *
 * Called from the M5 debit path (`meterAndCharge` for PAYG MeterKinds)
 * AFTER a debit has been written to CreditLedger. The contract is:
 *
 *   1. Caller computes `balanceAfterCents` from the post-debit ledger row.
 *   2. Caller invokes `maybeAutoRecharge(orgId, balanceAfterCents)`.
 *   3. This function decides whether to fire chargeTopUp(). It NEVER
 *      throws into the caller's hot path — debit succeeds independently
 *      of recharge success.
 *
 * The actual ledger credit happens later, when Stripe delivers
 * `payment_intent.succeeded` to the webhook. Day-bucket idempotency on
 * the Stripe key means concurrent debits in the same 24h window can't
 * double-charge the customer.
 */

import prisma from "./prisma.js";
import { Sentry, sentryEnabled } from "./sentry.js";
import { logger } from "./logger.js";
import { writeAudit } from "./audit.js";
import { sendEmail, APP_URL } from "./email.js";
import { chargeTopUp } from "../services/stripeBilling.js";

const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

export async function maybeAutoRecharge(
  orgId: string,
  balanceAfterCents: number
): Promise<void> {
  try {
    const ledger = await prisma.creditLedger.findUnique({
      where: { organizationId: orgId },
    });
    if (!ledger) return; // M4 hasn't initialized the ledger yet
    if (!ledger.autoRechargeEnabled) return;
    if (balanceAfterCents > ledger.autoRechargeThresholdCents) return;

    // Debounce: never fire twice within 5 min, even on a flurry of debits.
    if (
      ledger.lastAutoRechargeAt &&
      Date.now() - ledger.lastAutoRechargeAt.getTime() < DEBOUNCE_MS
    ) {
      logger.info(
        { orgId, balanceAfterCents },
        "[autoRecharge] debounced (last fire <5min ago)"
      );
      return;
    }

    // Pre-flight: card must be on file. If not, disable + warn the tenant.
    const provisioning = await prisma.tenantProvisioning.findUnique({
      where: { organizationId: orgId },
      select: { defaultPaymentMethodId: true },
    });
    if (!provisioning?.defaultPaymentMethodId) {
      await prisma.creditLedger.update({
        where: { organizationId: orgId },
        data: { autoRechargeEnabled: false },
      });
      await notifyAdmin(orgId, {
        subject: "Callora: Auto-recharge disabled — no payment method on file",
        body: "We tried to top up your Callora credits but no payment method is on file. Please add a card to keep your campaigns running.",
        cta: "Add Payment Method",
      });
      await writeAudit({
        actorType: "SYSTEM",
        actorId: "system",
        organizationId: orgId,
        targetOrganizationId: orgId,
        action: "AUTO_RECHARGE_DISABLED_NO_CARD",
        entity: "CreditLedger",
        metadata: { balanceAfterCents },
      });
      return;
    }

    // Day-bucket idempotency: at most one auto-recharge per UTC day per org.
    const day = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `auto-${orgId}-${day}`;

    try {
      const result = await chargeTopUp(orgId, ledger.autoRechargeAmountCents, {
        source: "AUTO_RECHARGE",
        idempotencyKey,
      });

      // Webhook will credit the ledger; we just record that we fired.
      await prisma.creditLedger.update({
        where: { organizationId: orgId },
        data: { lastAutoRechargeAt: new Date() },
      });
      await writeAudit({
        actorType: "SYSTEM",
        actorId: "system",
        organizationId: orgId,
        targetOrganizationId: orgId,
        action: "AUTO_RECHARGE_FIRED",
        entity: "CreditLedger",
        metadata: {
          amountCents: ledger.autoRechargeAmountCents,
          paymentIntentId: result.paymentIntentId,
          paymentIntentStatus: result.status,
        },
      });
    } catch (err: any) {
      // Card declined / Stripe error — disable auto-recharge so we don't
      // hammer the customer's card on every subsequent debit. They'll see
      // the "card declined" email and can fix it from the billing page.
      logger.warn(
        { err, orgId },
        "[autoRecharge] charge failed; disabling auto-recharge"
      );
      if (sentryEnabled) Sentry.captureException(err);

      await prisma.creditLedger.update({
        where: { organizationId: orgId },
        data: { autoRechargeEnabled: false },
      });
      await notifyAdmin(orgId, {
        subject: "Callora: Your card was declined — auto-recharge disabled",
        body: "We tried to auto-recharge your Callora credits but your card was declined. Auto-recharge has been turned off. Please update your payment method.",
        cta: "Update Payment Method",
      });
      await writeAudit({
        actorType: "SYSTEM",
        actorId: "system",
        organizationId: orgId,
        targetOrganizationId: orgId,
        action: "AUTO_RECHARGE_FAILED",
        entity: "CreditLedger",
        metadata: {
          error: err?.message ?? String(err),
          stripeCode: err?.code ?? err?.raw?.code ?? null,
        },
      });
    }
  } catch (outer) {
    // Outer guard — debits must never fail because of recharge bookkeeping.
    logger.error({ err: outer, orgId }, "[autoRecharge] outer failure");
    if (sentryEnabled) Sentry.captureException(outer);
  }
}

async function notifyAdmin(
  orgId: string,
  msg: { subject: string; body: string; cta: string }
): Promise<void> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { users: { where: { role: "ADMIN" }, take: 1 } },
    });
    const admin = org?.users?.[0];
    if (!admin?.email) return;
    const html = `<p style="font-family:Arial,sans-serif;color:#444;">Hi ${
      admin.name ?? "there"
    },</p>
<p style="font-family:Arial,sans-serif;color:#444;">${msg.body}</p>
<p><a href="${APP_URL}/billing" style="background:#DC0014;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">${msg.cta}</a></p>`;
    await sendEmail(admin.email, msg.subject, html, {
      organizationId: orgId,
      template: "AUTO_RECHARGE_NOTICE",
      required: false,
    });
  } catch (err) {
    logger.warn({ err, orgId }, "[autoRecharge] notify admin failed");
  }
}
