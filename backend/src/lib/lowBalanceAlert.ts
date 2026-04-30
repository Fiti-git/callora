/**
 * Phase 5 Agent M7 — Low-balance email alert.
 *
 * Fired (fire-and-forget) from the M5 PAYG debit path immediately after
 * `maybeAutoRecharge`. The contract:
 *
 *   - Auto-recharge is the customer's PRIMARY safety net. If it's enabled
 *     we stay silent — the recharge will keep them whole and the only
 *     email we want them to see is the (rare) "card declined" one.
 *   - When auto-recharge is OFF, we send a one-shot informational email
 *     the first time their balance crosses the configured threshold,
 *     debounced for 24h so a flurry of small debits don't spam them.
 *
 * Errors never propagate — logged + Sentry, then swallowed. The debit
 * path must not fail because of a transient SMTP hiccup.
 */
import prisma from "./prisma.js";
import { requireEnv } from "./env.js";
import { Sentry, sentryEnabled } from "./sentry.js";
import { logger } from "./logger.js";
import { sendEmail, APP_URL } from "./email.js";

const DEBOUNCE_MS = 24 * 60 * 60 * 1000; // 24 hours

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function maybeSendLowBalanceAlert(
  organizationId: string,
  balanceAfterCents: number
): Promise<void> {
  try {
    const threshold = Number(requireEnv("PAYG_LOW_BALANCE_ALERT_CENTS"));
    if (!Number.isFinite(threshold) || threshold <= 0) return;

    // Cheap exit before touching the DB — most debits leave plenty of
    // balance and never need to consult the ledger here.
    if (balanceAfterCents > threshold) return;

    const ledger = await prisma.creditLedger.findUnique({
      where: { organizationId },
    });
    if (!ledger) return;

    // Auto-recharge owns the customer-comms story when enabled. Don't
    // double-bug them with a "low balance" email when the recharge will
    // cover it.
    if (ledger.autoRechargeEnabled) return;

    // 24h debounce. Doesn't matter that the timer was set by an earlier
    // dip below threshold — the customer has already been told.
    if (
      ledger.lowBalanceAlertSentAt &&
      Date.now() - ledger.lowBalanceAlertSentAt.getTime() < DEBOUNCE_MS
    ) {
      return;
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { users: { where: { role: "ADMIN" }, take: 1 } },
    });
    const admin = org?.users?.[0];
    if (!admin?.email) return;

    const html = `<p style="font-family:Arial,sans-serif;color:#444;">Hi ${
      admin.name ?? "there"
    },</p>
<p style="font-family:Arial,sans-serif;color:#444;">Your Callora credits are running low. You currently have <strong>$${dollars(
      balanceAfterCents
    )}</strong> remaining. To avoid any pause in your campaigns, please top up.</p>
<p><a href="${APP_URL}/billing" style="background:#DC0014;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">Add credits</a></p>`;

    await sendEmail(
      admin.email,
      "Your Callora credits are running low",
      html,
      {
        organizationId,
        template: "LOW_BALANCE_ALERT",
        required: false,
      }
    );

    await prisma.creditLedger.update({
      where: { organizationId },
      data: { lowBalanceAlertSentAt: new Date() },
    });
  } catch (err) {
    logger.warn(
      { err, organizationId },
      "[lowBalanceAlert] failed (non-fatal)"
    );
    if (sentryEnabled) Sentry.captureException(err);
  }
}
