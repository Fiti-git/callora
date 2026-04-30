import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { requireEnv } from "../lib/env.js";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth.js";
import {
  createCheckoutSession,
  createPortalSession,
  verifyWebhook,
  stripe,
} from "../services/stripe.js";
import {
  ensureStripeCustomer,
  createSetupIntent,
  confirmDefaultPaymentMethod,
  chargeTopUp,
} from "../services/stripeBilling.js";
import { writeAudit, writeAuditLog } from "../lib/audit.js";
import { sendEmail, APP_URL } from "../lib/email.js";
import { dunningEmail } from "../emails/dunning.js";
import { initialDunningPayload } from "../lib/dunning.js";
import { logger } from "../lib/logger.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";

const router = express.Router();

const checkoutSchema = z.object({ planTier: z.enum(["STARTER", "PRO", "ENTERPRISE"]) });

// JSON parser for non-webhook endpoints; webhook uses raw body.
const jsonParser = express.json();

router.post(
  "/checkout",
  jsonParser,
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid plan" });

    const { organizationId, email } = (req as AuthRequest).user!;
    const plan = await prisma.plan.findUnique({
      where: { tier: parsed.data.planTier },
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const existing = await prisma.subscription.findUnique({
      where: { organizationId },
    });

    const frontend = process.env.TENANT_APP_ORIGIN || "http://localhost:3000";
    const session = await createCheckoutSession({
      stripePriceId: plan.stripePriceId,
      organizationId,
      customerEmail: email,
      existingCustomerId: existing?.stripeCustomerId ?? null,
      successUrl: `${frontend}/billing?success=1`,
      cancelUrl: `${frontend}/billing?canceled=1`,
    });

    res.json({ url: session.url });
  }
);

router.post(
  "/portal",
  jsonParser,
  // Allow PAST_DUE / SUSPENDED orgs through to the Stripe portal so they can
  // actually update their card and recover. The default `authenticate` blocks
  // PAST_DUE with 402 — we use the permissive variant here.
  authenticatePermissive,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const sub = await prisma.subscription.findUnique({ where: { organizationId } });
    if (!sub?.stripeCustomerId)
      return res.status(400).json({ error: "No Stripe customer on file" });

    const frontend = process.env.TENANT_APP_ORIGIN || "http://localhost:3000";
    const session = await createPortalSession(
      sub.stripeCustomerId,
      `${frontend}/billing`
    );
    res.json({ url: session.url });
  }
);

/**
 * Pay-now action triggered from the dunning page banner. Forces an immediate
 * stripe.invoices.pay() against the org's open DunningState. Tenant-scoped:
 * cross-org dunningStateIds 404. AuditLogged whether or not Stripe succeeds.
 */
router.post(
  "/dunning/pay-now",
  jsonParser,
  authenticatePermissive,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;

    const open = await prisma.dunningState.findFirst({
      where: {
        organizationId,
        status: { notIn: ["RESOLVED", "CANCELED"] },
      },
      orderBy: { firstFailedAt: "asc" },
    });
    if (!open) return res.status(404).json({ error: "No open dunning state" });

    if (!stripe) {
      return res.status(503).json({ error: "Stripe not configured" });
    }

    let paid = false;
    try {
      const inv = await stripe.invoices.pay(open.invoiceId);
      paid = inv.status === "paid";
    } catch (err: any) {
      logger.warn({ err, invoiceId: open.invoiceId }, "[billing] pay-now failed");
      if (sentryEnabled) Sentry.captureException(err);
      await writeAuditLog(req, "DUNNING_PAY_NOW_FAILED", "DunningState", open.id, {
        invoiceId: open.invoiceId,
        error: err?.message ?? String(err),
      });
      return res.status(402).json({ error: err?.message ?? "Payment failed", paid: false });
    }

    if (paid) {
      await prisma.dunningState.update({
        where: { id: open.id },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: "ACTIVE" },
      });
      await prisma.subscription.updateMany({
        where: { organizationId },
        data: { status: "ACTIVE" },
      });
      await writeAuditLog(req, "DUNNING_PAY_NOW_RESOLVED", "DunningState", open.id, {
        invoiceId: open.invoiceId,
      });
    } else {
      await writeAuditLog(req, "DUNNING_PAY_NOW_FAILED", "DunningState", open.id, {
        invoiceId: open.invoiceId,
      });
    }

    res.json({ paid });
  }
);

// ---------------------------------------------------------------------------
// Phase 5 Agent M2 — PAYG (Model B) credit endpoints.
//
// All five use the in-router `jsonParser` so they don't need the global
// express.json() (the webhook above this comment requires raw-body and so the
// global parser is mounted AFTER /api/billing in src/index.ts).
// ---------------------------------------------------------------------------

const TOPUP_AMOUNT_CENTS = 2500; // $25 — server-enforced at launch

const KIND_DISPLAY: Record<string, string> = {
  TOPUP: "Credits added",
  TOPUP_AUTO: "Auto-recharge",
  DEBIT_CALL: "AI call",
  DEBIT_QUALIFICATION: "Lead scoring",
  DEBIT_DISCOVERY: "Lead discovery",
  DEBIT_EMAIL: "Email send",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

router.post(
  "/credits/setup-intent",
  jsonParser,
  authenticate,
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      await ensureStripeCustomer(organizationId);
      const intent = await createSetupIntent(organizationId);
      res.json({ clientSecret: intent.clientSecret });
    } catch (err: any) {
      logger.error({ err, organizationId }, "[billing/credits] setup-intent failed");
      if (sentryEnabled) Sentry.captureException(err);
      res.status(500).json({ error: err?.message ?? "setup-intent failed" });
    }
  }
);

const paymentMethodSchema = z.object({ paymentMethodId: z.string().min(1) });

router.post(
  "/credits/payment-method",
  jsonParser,
  authenticate,
  async (req: Request, res: Response) => {
    const parsed = paymentMethodSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payment method" });
    const { organizationId } = (req as AuthRequest).user!;
    try {
      await confirmDefaultPaymentMethod(organizationId, parsed.data.paymentMethodId);
      await writeAuditLog(req, "PAYMENT_METHOD_SET", "TenantProvisioning", organizationId, {
        // Don't log the full PM id — keep last4 vibe with a prefix slice.
        paymentMethodIdPrefix: parsed.data.paymentMethodId.slice(0, 12),
      });
      res.json({ ok: true });
    } catch (err: any) {
      logger.error({ err, organizationId }, "[billing/credits] payment-method failed");
      if (sentryEnabled) Sentry.captureException(err);
      res.status(500).json({ error: err?.message ?? "payment-method failed" });
    }
  }
);

const topupSchema = z.object({ amountCents: z.number().int().positive() });

router.post(
  "/credits/topup",
  jsonParser,
  authenticate,
  async (req: Request, res: Response) => {
    const parsed = topupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid amount" });
    if (parsed.data.amountCents !== TOPUP_AMOUNT_CENTS) {
      return res.status(400).json({
        error: `Top-up amount must be ${TOPUP_AMOUNT_CENTS} cents at launch`,
      });
    }
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const result = await chargeTopUp(organizationId, parsed.data.amountCents, {
        source: "MANUAL",
      });
      await writeAuditLog(req, "CREDIT_TOPUP_INITIATED", "CreditLedger", organizationId, {
        amountCents: parsed.data.amountCents,
        paymentIntentId: result.paymentIntentId,
        status: result.status,
      });
      res.json(result);
    } catch (err: any) {
      logger.warn({ err, organizationId }, "[billing/credits] topup failed");
      if (sentryEnabled) Sentry.captureException(err);
      res.status(402).json({ error: err?.message ?? "Top-up failed" });
    }
  }
);

router.get(
  "/credits",
  jsonParser,
  authenticate,
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const [ledger, provisioning] = await Promise.all([
      prisma.creditLedger.findUnique({ where: { organizationId } }),
      prisma.tenantProvisioning.findUnique({
        where: { organizationId },
        select: { defaultPaymentMethodId: true },
      }),
    ]);
    res.json({
      balanceCents: ledger?.balanceCents ?? 0,
      autoRechargeEnabled: ledger?.autoRechargeEnabled ?? true,
      autoRechargeThresholdCents: ledger?.autoRechargeThresholdCents ?? 1000,
      autoRechargeAmountCents: ledger?.autoRechargeAmountCents ?? 2500,
      hasPaymentMethod: !!provisioning?.defaultPaymentMethodId,
    });
  }
);

const txQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

router.get(
  "/credits/transactions",
  jsonParser,
  authenticate,
  async (req: Request, res: Response) => {
    const parsed = txQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { organizationId } = (req as AuthRequest).user!;
    const limit = parsed.data.limit ?? 50;

    const rows = await prisma.creditTransaction.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(parsed.data.cursor
        ? { cursor: { id: parsed.data.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    res.json({
      transactions: page.map((tx) => ({
        id: tx.id,
        kind: tx.kind,
        display: KIND_DISPLAY[tx.kind] ?? tx.kind,
        amountCents: tx.amountCents,
        balanceAfterCents: tx.balanceAfterCents,
        ref: tx.ref,
        createdAt: tx.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  }
);

const autoRechargeSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z.number().int().min(500).max(10_000),
  amountCents: z.number().int().min(2500).max(50_000),
});

router.patch(
  "/credits/auto-recharge",
  jsonParser,
  authenticate,
  async (req: Request, res: Response) => {
    const parsed = autoRechargeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid auto-recharge config" });
    }
    const { organizationId } = (req as AuthRequest).user!;

    const existing = await prisma.creditLedger.findUnique({
      where: { organizationId },
    });
    const updated = await prisma.creditLedger.upsert({
      where: { organizationId },
      create: {
        organizationId,
        autoRechargeEnabled: parsed.data.enabled,
        autoRechargeThresholdCents: parsed.data.thresholdCents,
        autoRechargeAmountCents: parsed.data.amountCents,
      },
      update: {
        autoRechargeEnabled: parsed.data.enabled,
        autoRechargeThresholdCents: parsed.data.thresholdCents,
        autoRechargeAmountCents: parsed.data.amountCents,
      },
    });

    await writeAuditLog(req, "AUTO_RECHARGE_UPDATED", "CreditLedger", updated.id, {
      before: existing
        ? {
            enabled: existing.autoRechargeEnabled,
            thresholdCents: existing.autoRechargeThresholdCents,
            amountCents: existing.autoRechargeAmountCents,
          }
        : null,
      after: {
        enabled: parsed.data.enabled,
        thresholdCents: parsed.data.thresholdCents,
        amountCents: parsed.data.amountCents,
      },
    });

    res.json({
      enabled: updated.autoRechargeEnabled,
      thresholdCents: updated.autoRechargeThresholdCents,
      amountCents: updated.autoRechargeAmountCents,
    });
  }
);

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    let event;
    try {
      event = verifyWebhook(req.body as Buffer, sig);
    } catch (err: any) {
      console.error("stripe webhook verify failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Idempotency guard — Stripe retries deliveries on transient failures and
    // the same event id can land 2-3 times. Upsert the StripeWebhookEvent row
    // and short-circuit if it's already been processed.
    try {
      const existing = await prisma.stripeWebhookEvent.findUnique({
        where: { id: event.id },
      });
      if (existing?.processedAt) {
        return res.json({ received: true, duplicate: true });
      }
      await prisma.stripeWebhookEvent.upsert({
        where: { id: event.id },
        create: {
          id: event.id,
          type: event.type,
          livemode: !!event.livemode,
          receivedAt: new Date(),
        },
        update: {}, // keep original receivedAt
      });
    } catch (err) {
      // Best-effort. If the idempotency table isn't reachable, fall through and
      // process the event — at-least-once is better than dropping a webhook.
      logger.warn({ err, eventId: event.id }, "[billing] idempotency upsert failed (continuing)");
    }

    try {
      await handleStripeEvent(event);

      // Mark processed (best-effort).
      try {
        await prisma.stripeWebhookEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      } catch (err) {
        logger.warn({ err, eventId: event.id }, "[billing] failed to mark webhook processed");
      }

      // Audit row for every handled event so the platform admin has a trail.
      await writeAudit({
        actorType: "SYSTEM",
        actorId: "stripe",
        action: "STRIPE_WEBHOOK",
        metadata: { eventType: event.type, eventId: event.id, livemode: !!event.livemode },
      });

      res.json({ received: true });
    } catch (err: any) {
      console.error("stripe webhook handler failed:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

async function handleStripeEvent(event: any) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const organizationId =
        session.metadata?.organizationId || session.client_reference_id;
      if (!organizationId) return;

      const stripeCustomerId = session.customer as string;
      const stripeSubscriptionId = session.subscription as string;

      await prisma.subscription.update({
        where: { organizationId },
        data: {
          stripeCustomerId,
          stripeSubscriptionId,
          status: "ACTIVE",
        },
      });
      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: "ACTIVE" },
      });
      await writeAudit({
        actorType: "SYSTEM",
        actorId: "stripe",
        organizationId,
        action: "billing.checkout.completed",
      });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object;
      const organizationId = sub.metadata?.organizationId;
      if (!organizationId) return;
      const status = mapStripeStatus(sub.status);
      await prisma.subscription.update({
        where: { organizationId },
        data: {
          status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          stripeSubscriptionId: sub.id,
        },
      });
      if (status === "ACTIVE") {
        await prisma.organization.update({
          where: { id: organizationId },
          data: { status: "ACTIVE" },
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const organizationId = sub.metadata?.organizationId;
      if (!organizationId) return;
      await prisma.subscription.update({
        where: { organizationId },
        data: { status: "CANCELED" },
      });
      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: "CANCELED" },
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const stripeCustomerId = invoice.customer as string;
      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId },
        include: {
          organization: { include: { users: { where: { role: "ADMIN" } } } },
        },
      });
      if (!sub) return;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "PAST_DUE" },
      });
      await prisma.organization.update({
        where: { id: sub.organizationId },
        data: { status: "PAST_DUE" },
      });

      // Open / refresh DunningState for this invoice (idempotent on invoiceId).
      try {
        const payload = initialDunningPayload({
          organizationId: sub.organizationId,
          invoiceId: invoice.id as string,
          subscriptionId: (invoice.subscription as string) ?? sub.stripeSubscriptionId,
          amountDueCents: typeof invoice.amount_due === "number" ? invoice.amount_due : null,
          currency: typeof invoice.currency === "string" ? invoice.currency : null,
        });
        await prisma.dunningState.upsert({
          where: { invoiceId: payload.invoiceId },
          create: payload,
          update: {
            // Don't reset attempt or status if a row already exists — Stripe
            // sometimes re-fires payment_failed for the same invoice.
            amountDueCents: payload.amountDueCents,
            currency: payload.currency,
          },
        });
        await writeAudit({
          actorType: "SYSTEM",
          actorId: "stripe",
          organizationId: sub.organizationId,
          targetOrganizationId: sub.organizationId,
          action: "DUNNING_OPENED",
          entity: "DunningState",
          metadata: { invoiceId: payload.invoiceId, attempt: 1 },
        });
      } catch (err) {
        logger.error({ err, invoiceId: invoice.id }, "[billing] failed to upsert DunningState");
        if (sentryEnabled) Sentry.captureException(err);
      }

      const admin = sub.organization.users[0];
      if (admin?.email) {
        const { subject, html } = dunningEmail("DUNNING_DAY_0_FAILED", {
          name: admin.name ?? "",
          billingUrl: `${APP_URL}/billing/dunning`,
        });
        await sendEmail(admin.email, subject, html, {
          organizationId: sub.organizationId,
          template: "DUNNING_DAY_0_FAILED",
          required: false,
        });
      }
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      const stripeCustomerId = invoice.customer as string;
      const invoiceId = invoice.id as string;

      // If there's an open DunningState for this invoice, recover it.
      const open = await prisma.dunningState.findUnique({
        where: { invoiceId },
      });
      if (open && open.status !== "RESOLVED" && open.status !== "CANCELED") {
        await prisma.dunningState.update({
          where: { id: open.id },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
        await prisma.organization.update({
          where: { id: open.organizationId },
          data: { status: "ACTIVE" },
        });
        await prisma.subscription.updateMany({
          where: { organizationId: open.organizationId },
          data: { status: "ACTIVE" },
        });
        await writeAudit({
          actorType: "SYSTEM",
          actorId: "stripe",
          organizationId: open.organizationId,
          targetOrganizationId: open.organizationId,
          action: "DUNNING_RESOLVED",
          entity: "DunningState",
          entityId: open.id,
          metadata: { invoiceId, source: "invoice.payment_succeeded" },
        });

        const orgWithAdmin = await prisma.organization.findUnique({
          where: { id: open.organizationId },
          include: { users: { where: { role: "ADMIN" }, take: 1 } },
        });
        const admin = orgWithAdmin?.users?.[0];
        if (admin?.email) {
          const { subject, html } = dunningEmail("DUNNING_RECOVERED", {
            name: admin.name ?? "",
            billingUrl: `${APP_URL}/billing`,
          });
          await sendEmail(admin.email, subject, html, {
            organizationId: open.organizationId,
            template: "DUNNING_RECOVERED",
            required: false,
          });
        }
      } else {
        // Even without a dunning state, ensure subscription tracks ACTIVE on
        // a successful payment — covers normal renewal flows.
        if (stripeCustomerId) {
          await prisma.subscription.updateMany({
            where: { stripeCustomerId },
            data: { status: "ACTIVE" },
          });
        }
      }
      break;
    }
    // ----- Phase 5 Agent M2 — PAYG top-up + dispute events -------------
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const meta = intent.metadata ?? {};
      if (meta.kind !== "PAYG_TOPUP") return; // not ours
      const organizationId = meta.organizationId as string | undefined;
      const amountCents = typeof intent.amount === "number" ? intent.amount : 0;
      if (!organizationId || amountCents <= 0) return;
      const source = (meta.source as string) === "AUTO_RECHARGE"
        ? "TOPUP_AUTO"
        : "TOPUP";

      await prisma.$transaction(async (tx) => {
        // Idempotency: if a TOPUP row with this paymentIntent already exists,
        // bail. The StripeWebhookEvent table also dedupes at the outer layer,
        // but a retry from a different code path (eager insert in chargeTopUp
        // future variant) shouldn't double-credit.
        const existingTx = await tx.creditTransaction.findFirst({
          where: { organizationId, kind: { in: ["TOPUP", "TOPUP_AUTO"] }, ref: intent.id },
        });
        if (existingTx) return;

        const ledger = await tx.creditLedger.upsert({
          where: { organizationId },
          create: {
            organizationId,
            balanceCents: amountCents,
            lifetimeAddedCents: amountCents,
          },
          update: {
            balanceCents: { increment: amountCents },
            lifetimeAddedCents: { increment: amountCents },
            lowBalanceAlertSentAt: null, // clear so the next dip re-fires the alert
          },
        });
        await tx.creditTransaction.create({
          data: {
            ledgerId: ledger.id,
            organizationId,
            kind: source,
            amountCents,
            balanceAfterCents: ledger.balanceCents,
            ref: intent.id,
            metadata: { source: meta.source ?? "MANUAL" },
          },
        });
      });

      await writeAudit({
        actorType: "SYSTEM",
        actorId: "stripe",
        organizationId,
        targetOrganizationId: organizationId,
        action: "CREDIT_TOPUP_RECEIVED",
        entity: "CreditLedger",
        metadata: {
          source: meta.source ?? "MANUAL",
          amountCents,
          paymentIntentId: intent.id,
        },
      });

      // Phase 5 Agent M5 — recovery from PAUSED_NO_CREDIT. A successful
      // top-up always lifts the soft pause (the ledger now has positive
      // balance again). Other org statuses are left alone.
      try {
        const orgRow = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { status: true },
        });
        if (orgRow?.status === "PAUSED_NO_CREDIT") {
          await prisma.organization.update({
            where: { id: organizationId },
            data: { status: "ACTIVE" },
          });
          await writeAudit({
            actorType: "SYSTEM",
            actorId: "stripe",
            organizationId,
            targetOrganizationId: organizationId,
            action: "ORG_RESUMED_AFTER_TOPUP",
            entity: "Organization",
            entityId: organizationId,
            metadata: { paymentIntentId: intent.id, amountCents },
          });
        }
      } catch (err) {
        logger.warn(
          { err, organizationId },
          "[billing] PAUSED_NO_CREDIT recovery flip failed"
        );
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const meta = intent.metadata ?? {};
      if (meta.kind !== "PAYG_TOPUP") return;
      const organizationId = meta.organizationId as string | undefined;
      if (!organizationId) return;
      const source = meta.source as string | undefined;

      if (source === "AUTO_RECHARGE") {
        try {
          await prisma.creditLedger.update({
            where: { organizationId },
            data: { autoRechargeEnabled: false },
          });
        } catch (err) {
          logger.warn({ err, organizationId }, "[billing] disable auto-recharge failed");
        }

        const orgWithAdmin = await prisma.organization.findUnique({
          where: { id: organizationId },
          include: { users: { where: { role: "ADMIN" }, take: 1 } },
        });
        const admin = orgWithAdmin?.users?.[0];
        if (admin?.email) {
          await sendEmail(
            admin.email,
            "Callora: Your card was declined — auto-recharge disabled",
            `<p style="font-family:Arial,sans-serif;color:#444;">Hi ${admin.name ?? "there"},</p>
             <p style="font-family:Arial,sans-serif;color:#444;">We tried to auto-recharge your Callora credits but your card was declined. Auto-recharge has been turned off.</p>
             <p><a href="${APP_URL}/billing" style="background:#DC0014;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">Update Payment Method</a></p>`,
            { organizationId, template: "AUTO_RECHARGE_DECLINED", required: false }
          );
        }
      }
      // For MANUAL we don't disable anything — the user already saw the failure.

      await writeAudit({
        actorType: "SYSTEM",
        actorId: "stripe",
        organizationId,
        targetOrganizationId: organizationId,
        action: source === "AUTO_RECHARGE" ? "AUTO_RECHARGE_FAILED" : "MANUAL_TOPUP_FAILED",
        entity: "CreditLedger",
        metadata: {
          paymentIntentId: intent.id,
          stripeCode: intent.last_payment_error?.code ?? null,
          stripeMessage: intent.last_payment_error?.message ?? null,
        },
      });
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent as string | undefined;
      if (!paymentIntentId) return;

      // Look up the original TOPUP transaction by paymentIntent ref so we can
      // find the org. If we can't find it, the refund is for a non-PAYG
      // charge (e.g. legacy subscription invoice) — ignore.
      const topup = await prisma.creditTransaction.findFirst({
        where: { ref: paymentIntentId, kind: { in: ["TOPUP", "TOPUP_AUTO"] } },
      });
      if (!topup) return;

      // amount_refunded is cumulative; we want the delta of THIS event. The
      // simplest robust path: take the latest refund off charge.refunds.data.
      const refundsList: any[] = charge.refunds?.data ?? [];
      const latestRefund = refundsList[0];
      if (!latestRefund?.id || !latestRefund.amount) return;
      const refundAmount = latestRefund.amount as number;

      await prisma.$transaction(async (tx) => {
        // Dedupe on refund.id — m2's eager helper or a duplicate webhook
        // delivery shouldn't double-credit.
        const existing = await tx.creditTransaction.findFirst({
          where: {
            organizationId: topup.organizationId,
            kind: "REFUND",
            ref: latestRefund.id,
          },
        });
        if (existing) return;

        const ledger = await tx.creditLedger.upsert({
          where: { organizationId: topup.organizationId },
          create: {
            organizationId: topup.organizationId,
            balanceCents: refundAmount,
            lifetimeAddedCents: refundAmount,
          },
          update: {
            balanceCents: { increment: refundAmount },
            lifetimeAddedCents: { increment: refundAmount },
          },
        });
        await tx.creditTransaction.create({
          data: {
            ledgerId: ledger.id,
            organizationId: topup.organizationId,
            kind: "REFUND",
            amountCents: refundAmount,
            balanceAfterCents: ledger.balanceCents,
            ref: latestRefund.id,
            metadata: { paymentIntentId, chargeId: charge.id },
          },
        });
      });

      await writeAudit({
        actorType: "SYSTEM",
        actorId: "stripe",
        organizationId: topup.organizationId,
        targetOrganizationId: topup.organizationId,
        action: "CREDIT_REFUND_PROCESSED",
        entity: "CreditLedger",
        metadata: { refundId: latestRefund.id, amountCents: refundAmount, paymentIntentId },
      });
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated":
    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const chargeId = dispute.charge as string | undefined;
      const paymentIntentId = dispute.payment_intent as string | undefined;
      if (!chargeId && !paymentIntentId) return;

      const topup = await prisma.creditTransaction.findFirst({
        where: {
          ref: paymentIntentId ?? chargeId,
          kind: { in: ["TOPUP", "TOPUP_AUTO"] },
        },
      });
      if (!topup) return;

      const amount = typeof dispute.amount === "number" ? dispute.amount : 0;
      let delta = 0;
      if (event.type === "charge.dispute.funds_withdrawn") delta = -amount;
      else if (event.type === "charge.dispute.funds_reinstated") delta = amount;
      else if (event.type === "charge.dispute.closed" && dispute.status === "won") delta = amount;
      else if (event.type === "charge.dispute.closed" && dispute.status === "lost") {
        // Already withdrawn at funds_withdrawn — don't double-debit.
        delta = 0;
      }

      if (delta !== 0) {
        await prisma.$transaction(async (tx) => {
          const refKey = `dispute:${dispute.id}:${event.type}`;
          const existing = await tx.creditTransaction.findFirst({
            where: { organizationId: topup.organizationId, kind: "ADJUSTMENT", ref: refKey },
          });
          if (existing) return;

          const ledger = await tx.creditLedger.upsert({
            where: { organizationId: topup.organizationId },
            create: {
              organizationId: topup.organizationId,
              balanceCents: Math.max(0, delta),
              lifetimeAddedCents: Math.max(0, delta),
            },
            update: {
              balanceCents: { increment: delta },
              ...(delta > 0
                ? { lifetimeAddedCents: { increment: delta } }
                : { lifetimeSpentCents: { increment: Math.abs(delta) } }),
            },
          });
          await tx.creditTransaction.create({
            data: {
              ledgerId: ledger.id,
              organizationId: topup.organizationId,
              kind: "ADJUSTMENT",
              amountCents: delta,
              balanceAfterCents: ledger.balanceCents,
              ref: refKey,
              metadata: {
                disputeId: dispute.id,
                eventType: event.type,
                disputeStatus: dispute.status ?? null,
              },
            },
          });
        });
      }

      await writeAudit({
        actorType: "SYSTEM",
        actorId: "stripe",
        organizationId: topup.organizationId,
        targetOrganizationId: topup.organizationId,
        action: `STRIPE_DISPUTE_${event.type.split(".").pop()?.toUpperCase()}`,
        entity: "CreditLedger",
        metadata: {
          disputeId: dispute.id,
          status: dispute.status ?? null,
          amountCents: amount,
          delta,
        },
      });
      break;
    }
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object;
      const organizationId = sub.metadata?.organizationId;
      if (!organizationId) return;
      const dbSub = await prisma.subscription.findFirst({
        where: { organizationId },
        include: { organization: { include: { users: { where: { role: "ADMIN" } } } } },
      });
      const admin = dbSub?.organization.users[0];
      if (admin?.email) {
        await sendEmail(
          admin.email,
          "Your Callora trial is ending soon",
          `<p style="font-family:Arial,sans-serif;color:#444;">Hi ${admin.name ?? "there"},</p>
           <p style="font-family:Arial,sans-serif;color:#444;">Your free trial ends in 3 days. Add a payment method now to keep your campaigns running.</p>
           <p><a href="${APP_URL}/billing" style="background:#DC0014;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">Choose a Plan</a></p>`,
          {
            organizationId: dbSub!.organizationId,
            template: "trialWillEnd",
            required: false,
          }
        );
      }
      break;
    }
  }
}

function mapStripeStatus(s: string): "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" {
  switch (s) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "INCOMPLETE";
  }
}

// Permissive variant of the standard authenticate middleware. Same JWT +
// tokenVersion checks, but does NOT 402 PAST_DUE / SUSPENDED orgs — needed so
// failed-payment customers can actually reach the Stripe portal + dunning
// pay-now action to recover. Pulled inline to avoid a circular dependency
// with middleware/auth.ts.
const SECRET = requireEnv("NEXTAUTH_SECRET");
async function authenticatePermissive(
  req: Request,
  res: Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET) as any;
    (req as AuthRequest).user = decoded;
    const [org, user] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: decoded.organizationId },
        select: { status: true },
      }),
      prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, tokenVersion: true },
      }),
    ]);
    if (!org) return res.status(401).json({ error: "Unauthorized: Organization not found" });
    if (!user) return res.status(401).json({ error: "Unauthorized: User not found" });
    const tokenVersion = typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0;
    if (tokenVersion !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: "Unauthorized: Token revoked" });
    }
    // Block fully-canceled only — PAST_DUE / SUSPENDED must be allowed through.
    if (org.status === "CANCELED") {
      return res.status(402).json({ error: "Organization access blocked", status: org.status });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}

export default router;
