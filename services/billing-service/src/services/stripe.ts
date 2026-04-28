import Stripe from "stripe";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

export const stripe = STRIPE_SECRET
  ? new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" as any })
  : null;

export function ensureStripe(): Stripe {
  if (!stripe) {
    throw new Error("Stripe not configured: missing STRIPE_SECRET_KEY");
  }
  return stripe;
}

export async function createCheckoutSession(params: {
  stripePriceId: string;
  organizationId: string;
  customerEmail: string;
  existingCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const s = ensureStripe();
  return s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: params.stripePriceId, quantity: 1 }],
    customer: params.existingCustomerId || undefined,
    customer_email: params.existingCustomerId ? undefined : params.customerEmail,
    client_reference_id: params.organizationId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { organizationId: params.organizationId },
    subscription_data: {
      metadata: { organizationId: params.organizationId },
    },
  });
}

export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string
) {
  const s = ensureStripe();
  return s.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}

export function verifyWebhook(rawBody: Buffer, signature: string) {
  const s = ensureStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
  return s.webhooks.constructEvent(rawBody, signature, secret);
}
