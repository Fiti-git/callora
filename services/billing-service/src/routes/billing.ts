import express, { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@callora/shared";
import { authenticate, AuthRequest, requireRole } from "../middleware/requireAuth.js";
import {
  createCheckoutSession,
  createPortalSession,
  verifyWebhook,
  ensureMeteredItems,
  clearMeterItemCacheForOrg,
} from "../services/stripe.js";

const router = express.Router();

const checkoutSchema = z.object({ planTier: z.enum(["STARTER", "PRO", "ENTERPRISE"]) });

// JSON parser for non-webhook endpoints; webhook uses raw body (mounted in index.ts).
const jsonParser = express.json();

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

async function writeAudit(params: {
  actorType: "PLATFORM" | "TENANT" | "SYSTEM";
  actorId: string;
  organizationId?: string | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        organizationId: params.organizationId ?? null,
        action: params.action,
        target: params.target,
        metadata: params.metadata as any,
      },
    });
  } catch (err) {
    console.error("auditLog write failed:", err);
  }
}

async function sendNotification(template: string, to: string, data: Record<string, unknown>) {
  const url = process.env.NOTIFICATION_SERVICE_URL;
  if (!url) {
    console.warn("[billing] NOTIFICATION_SERVICE_URL not set; skipping notification", template);
    return;
  }
  try {
    const res = await fetch(`${url}/internal/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, to, data }),
    });
    if (!res.ok) {
      console.error(`[billing] notification-service returned ${res.status} for template=${template}`);
    }
  } catch (err) {
    console.error(`[billing] notification-service call failed for template=${template}:`, err);
  }
}

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

// Webhook handler exported separately and mounted with raw body in index.ts (before express.json()).
export const webhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  let event;
  try {
    event = await verifyWebhook(req.body as Buffer, sig);
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
};

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
        data: {
          status: "ACTIVE",
          // Advance onboarding — user has paid, next step is configure AI caller
          onboardingStep: "setup_caller",
        },
      });
      await writeAudit({
        actorType: "SYSTEM",
        actorId: "stripe",
        organizationId,
        action: "billing.checkout.completed",
      });

      // Auto-provision a dedicated Vapi phone number for this org.
      // Fire-and-forget — failure is logged but must not fail the webhook response
      // (Stripe requires a 200 within 30s).
      const callingServiceUrl = process.env.CALLING_SERVICE_URL;
      if (callingServiceUrl) {
        const updatedOrg = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        });
        fetch(`${callingServiceUrl}/internal/provision-number`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            orgName: updatedOrg?.name ?? organizationId,
          }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const body = await r.text().catch(() => "");
              console.error(
                `[billing] provision-number returned ${r.status}: ${body}`
              );
            } else {
              const data = await r.json().catch(() => ({}));
              console.log(
                `[billing] phone provisioned for org ${organizationId}: ${(data as any).phoneNumber}`
              );
            }
          })
          .catch((err) =>
            console.error("[billing] provision-number call failed:", err)
          );
      } else {
        console.warn("[billing] CALLING_SERVICE_URL not set — skipping phone provisioning");
      }

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

      // Make sure all 3 metered items are attached, and refresh the in-memory
      // meter→subscriptionItem cache for this org.
      try {
        clearMeterItemCacheForOrg(organizationId);
        await ensureMeteredItems(sub.id, organizationId);
      } catch (err) {
        console.error(
          `[billing] ensureMeteredItems failed for org ${organizationId}:`,
          err
        );
      }

      if (status === "ACTIVE") {
        await prisma.organization.update({
          where: { id: organizationId },
          data: { status: "ACTIVE" },
        });

        // Provision a Vapi number if the org doesn't already have one.
        triggerProvisionNumber(organizationId).catch((err) =>
          console.error("[billing] provision trigger failed:", err)
        );
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
      clearMeterItemCacheForOrg(organizationId);
      // Release the dedicated Vapi number — fire and forget.
      triggerReleaseNumber(organizationId).catch((err) =>
        console.error("[billing] release trigger failed:", err)
      );
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
        await sendNotification("paymentFailed", admin.email, {
          name: admin.name ?? "there",
          billingUrl: `${APP_URL}/billing`,
        });
      }
      break;
    }
    case "invoice.payment_succeeded": {
      // no-op beyond the subscription.updated handler
      break;
    }
  }
}

/**
 * POST to calling-service to provision a dedicated Vapi number for `orgId`.
 * Idempotent on the calling-service side.
 */
async function triggerProvisionNumber(organizationId: string) {
  const callingServiceUrl = process.env.CALLING_SERVICE_URL;
  if (!callingServiceUrl) {
    console.warn(
      "[billing] CALLING_SERVICE_URL not set — skipping number provision"
    );
    return;
  }
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, vapiPhoneNumberId: true },
  });
  if (org?.vapiPhoneNumberId) return; // already has one
  const r = await fetch(`${callingServiceUrl}/internal/provision-number`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organizationId,
      orgName: org?.name ?? organizationId,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error(
      `[billing] provision-number returned ${r.status}: ${body}`
    );
  }
}

/**
 * POST to calling-service to release a previously provisioned Vapi number.
 * Calling-service is expected to expose POST /internal/release-number;
 * if it does not, the call simply 404s and we log it.
 */
async function triggerReleaseNumber(organizationId: string) {
  const callingServiceUrl = process.env.CALLING_SERVICE_URL;
  if (!callingServiceUrl) return;
  try {
    const r = await fetch(`${callingServiceUrl}/internal/release-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!r.ok && r.status !== 404) {
      const body = await r.text().catch(() => "");
      console.error(
        `[billing] release-number returned ${r.status}: ${body}`
      );
    }
  } catch (err) {
    console.error("[billing] release-number call failed:", err);
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
