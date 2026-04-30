/**
 * Phase 5 Agent M2 — Stripe wrapper for PAYG (Model B) credits.
 *
 * Pure functions, no class. All callers import the singleton `stripe`
 * instance from `./stripe.js` so we don't proliferate Stripe SDK clients.
 *
 * Idempotency: Stripe accepts an `Idempotency-Key` header on POST. We use
 * deterministic keys (e.g. `customer:${orgId}`, `auto-${orgId}-${day}`) so
 * retries from upstream callers — and concurrent debit fan-outs in the
 * auto-recharge engine — collapse server-side instead of double-charging.
 *
 * AUDIT: these helpers do NOT call writeAuditLog directly; the route layer
 * does. This keeps them reusable from worker contexts (no `req`).
 */

import prisma from "../lib/prisma.js";
import { ensureStripe } from "./stripe.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import { logger } from "../lib/logger.js";

/**
 * Upsert a Stripe Customer for the given organization. Returns the
 * existing `stripeCustomerId` from TenantProvisioning if present, otherwise
 * creates a new Customer with `metadata.organizationId` and persists the
 * id back to TenantProvisioning (1:1 with Organization — upsert).
 */
export async function ensureStripeCustomer(orgId: string): Promise<string> {
  const stripe = ensureStripe();

  const existing = await prisma.tenantProvisioning.findUnique({
    where: { organizationId: orgId },
    select: { stripeCustomerId: true },
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) throw new Error(`Organization ${orgId} not found`);

  const customer = await stripe.customers.create(
    {
      metadata: {
        organizationId: org.id,
        organizationName: org.name ?? "",
      },
    },
    { idempotencyKey: `customer:${orgId}` }
  );

  // 1:1 with Organization — upsert, never plain create.
  await prisma.tenantProvisioning.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      stripeCustomerId: customer.id,
    },
    update: {
      stripeCustomerId: customer.id,
    },
  });

  return customer.id;
}

/**
 * Create a SetupIntent so the tenant frontend can collect a card with
 * Stripe.js Elements and attach it for off-session charging later. Returns
 * the client_secret only — no DB state is persisted here.
 *
 * The idempotency key is bucketed per minute so a fast double-submit
 * during the same form interaction reuses the same intent, but a brand-new
 * "set up another card" flow a few minutes later gets a fresh one.
 */
export async function createSetupIntent(
  orgId: string
): Promise<{ clientSecret: string; setupIntentId: string }> {
  const stripe = ensureStripe();
  const customerId = await ensureStripeCustomer(orgId);

  const minuteBucket = Math.floor(Date.now() / 60_000);
  const intent = await stripe.setupIntents.create(
    {
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { organizationId: orgId, kind: "PAYG_SETUP" },
    },
    { idempotencyKey: `setup:${orgId}:${minuteBucket}` }
  );

  if (!intent.client_secret) {
    throw new Error("Stripe SetupIntent returned no client_secret");
  }
  return { clientSecret: intent.client_secret, setupIntentId: intent.id };
}

/**
 * Attach the given PaymentMethod to the org's Stripe Customer, set it as
 * the customer's default for off-session charges, and persist
 * `defaultPaymentMethodId` to TenantProvisioning.
 */
export async function confirmDefaultPaymentMethod(
  orgId: string,
  paymentMethodId: string
): Promise<void> {
  const stripe = ensureStripe();
  const customerId = await ensureStripeCustomer(orgId);

  // Attach is idempotent for an already-attached method (Stripe returns the
  // same PM). We still wrap so a duplicate request from the UI is harmless.
  try {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  } catch (err: any) {
    // If the PM is already attached to this customer, Stripe throws. That's
    // fine — proceed to set as default.
    const code = err?.code ?? err?.raw?.code;
    if (code !== "resource_already_exists" && code !== "payment_method_already_attached") {
      throw err;
    }
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  await prisma.tenantProvisioning.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      stripeCustomerId: customerId,
      defaultPaymentMethodId: paymentMethodId,
    },
    update: { defaultPaymentMethodId: paymentMethodId },
  });
}

/**
 * Off-session top-up. Both MANUAL (tenant-clicked) and AUTO_RECHARGE flows
 * route through here because the customer's card is already attached to
 * their Stripe Customer record — there's no SCA prompt needed for a saved
 * card. The PaymentIntent is confirmed inline (`confirm: true`).
 *
 * The webhook handler in `routes/billing.ts` (payment_intent.succeeded with
 * `metadata.kind === "PAYG_TOPUP"`) is what actually credits the ledger.
 * This function intentionally does NOT touch CreditLedger — that keeps the
 * "money received" event single-sourced from Stripe.
 */
export async function chargeTopUp(
  orgId: string,
  amountCents: number,
  opts: { source: "MANUAL" | "AUTO_RECHARGE"; idempotencyKey?: string }
): Promise<{ paymentIntentId: string; status: string }> {
  const stripe = ensureStripe();

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`Invalid top-up amount: ${amountCents}`);
  }

  const provisioning = await prisma.tenantProvisioning.findUnique({
    where: { organizationId: orgId },
    select: { stripeCustomerId: true, defaultPaymentMethodId: true },
  });
  if (!provisioning?.stripeCustomerId || !provisioning.defaultPaymentMethodId) {
    throw new Error(
      `Org ${orgId} has no payment method on file — cannot charge top-up`
    );
  }

  const idempotencyKey =
    opts.idempotencyKey ?? `topup:${orgId}:${Date.now()}`;

  const intent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      customer: provisioning.stripeCustomerId,
      payment_method: provisioning.defaultPaymentMethodId,
      confirm: true,
      off_session: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        organizationId: orgId,
        kind: "PAYG_TOPUP",
        source: opts.source,
        amountCents: String(amountCents),
      },
    },
    { idempotencyKey }
  );

  return { paymentIntentId: intent.id, status: intent.status };
}

/**
 * Admin-initiated refund of a single bad call's debit. Looks up the
 * CreditTransaction by id (must belong to orgId — cross-org returns 404
 * via the calling route), issues a Stripe refund against the originating
 * top-up PaymentIntent, and inserts a REFUND CreditTransaction crediting
 * the ledger by the absolute debit amount.
 *
 * The webhook handler also has a `charge.refunded` safety net that's
 * idempotent on `ref` — second insertion is suppressed there.
 */
export async function refundCreditTransaction(
  orgId: string,
  creditTransactionId: string,
  reason: string
): Promise<{ refundId: string; amountCents: number }> {
  const stripe = ensureStripe();

  const debit = await prisma.creditTransaction.findFirst({
    where: { id: creditTransactionId, organizationId: orgId },
  });
  if (!debit) throw new Error("CreditTransaction not found");

  // Only refund debits that target a single CallLog — broader refunds go
  // through the Stripe dashboard for now.
  const meta = (debit.metadata ?? {}) as Record<string, unknown>;
  if (!meta.callLogId) {
    throw new Error("Only call-debits can be refunded via this helper");
  }
  if (debit.amountCents >= 0) {
    throw new Error("CreditTransaction is not a debit");
  }

  // Find the originating top-up so we know which PaymentIntent to refund.
  // We pick the most recent positive TOPUP for the org. A more precise
  // mapping would require ledger-level FIFO accounting; this is the
  // simplest correct path until we ship that.
  const topup = await prisma.creditTransaction.findFirst({
    where: {
      organizationId: orgId,
      kind: { in: ["TOPUP", "TOPUP_AUTO"] },
      ref: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!topup?.ref) throw new Error("No top-up payment intent to refund against");

  const refundAmount = Math.abs(debit.amountCents);
  const refund = await stripe.refunds.create(
    {
      payment_intent: topup.ref,
      amount: refundAmount,
      reason: "requested_by_customer",
      metadata: {
        organizationId: orgId,
        creditTransactionId,
        adminReason: reason,
      },
    },
    { idempotencyKey: `refund:${creditTransactionId}` }
  );

  // Insert REFUND row eagerly so the user sees it instantly. The webhook
  // is the safety net — it dedupes on `ref`.
  try {
    await prisma.$transaction(async (tx) => {
      const ledger = await tx.creditLedger.upsert({
        where: { organizationId: orgId },
        create: { organizationId: orgId, balanceCents: refundAmount, lifetimeAddedCents: refundAmount },
        update: {
          balanceCents: { increment: refundAmount },
          lifetimeAddedCents: { increment: refundAmount },
        },
      });
      const existingRefund = await tx.creditTransaction.findFirst({
        where: { organizationId: orgId, kind: "REFUND", ref: refund.id },
      });
      if (existingRefund) return;
      await tx.creditTransaction.create({
        data: {
          ledgerId: ledger.id,
          organizationId: orgId,
          kind: "REFUND",
          amountCents: refundAmount,
          balanceAfterCents: ledger.balanceCents,
          ref: refund.id,
          metadata: { reason, sourceCreditTransactionId: creditTransactionId },
        },
      });
    });
  } catch (err) {
    logger.error({ err, refundId: refund.id }, "[stripeBilling] eager REFUND insert failed; webhook will retry");
    if (sentryEnabled) Sentry.captureException(err);
    throw err;
  }

  return { refundId: refund.id, amountCents: refundAmount };
}
