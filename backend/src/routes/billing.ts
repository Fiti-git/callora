import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth.js";
import {
  createCheckoutSession,
  createPortalSession,
  verifyWebhook,
} from "../services/stripe.js";
import { writeAudit } from "../lib/audit.js";
import { sendEmail, APP_URL } from "../lib/email.js";

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
  authenticate,
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

    try {
      await handleStripeEvent(event);
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

      const admin = sub.organization.users[0];
      if (admin?.email) {
        await sendEmail(
          admin.email,
          "Action required: payment failed for Callora",
          `<p style="font-family:Arial,sans-serif;color:#444;">Hi ${admin.name ?? "there"},</p>
           <p style="font-family:Arial,sans-serif;color:#444;">Your recent payment failed. Please update your payment method to avoid service interruption.</p>
           <p><a href="${APP_URL}/billing" style="background:#DC0014;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">Update Payment Method</a></p>`
        );
      }
      break;
    }
    case "invoice.payment_succeeded": {
      // no-op beyond the subscription.updated handler
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
           <p><a href="${APP_URL}/billing" style="background:#DC0014;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">Choose a Plan</a></p>`
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

export default router;
