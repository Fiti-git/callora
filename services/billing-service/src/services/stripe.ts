import Stripe from "stripe";
import { getServiceSecret } from "../config.js";
import { timeVendorCall, logger } from "@callora/shared";

let _stripe: Stripe | null = null;
let _initPromise: Promise<Stripe | null> | null = null;

/**
 * Lazily resolve the Stripe client using the platform-owned secret backend
 * (`getServiceSecret`). Cached for the process lifetime.
 */
export async function getStripe(): Promise<Stripe> {
  if (_stripe) return _stripe;
  if (!_initPromise) {
    _initPromise = (async () => {
      try {
        const key = await getServiceSecret("STRIPE_SECRET_KEY");
        if (!key) return null;
        _stripe = new Stripe(key, { apiVersion: "2024-06-20" as any });
        return _stripe;
      } catch (err) {
        logger.error({ err }, "[billing] failed to load STRIPE_SECRET_KEY");
        return null;
      }
    })();
  }
  const s = await _initPromise;
  if (!s) {
    throw new Error("Stripe not configured: STRIPE_SECRET_KEY unavailable");
  }
  return s;
}

export async function ensureStripe(): Promise<Stripe> {
  return getStripe();
}

export async function createCheckoutSession(params: {
  stripePriceId: string;
  organizationId: string;
  customerEmail: string;
  existingCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const s = await ensureStripe();
  return timeVendorCall("stripe", "checkout.create", () => _doCreateCheckout(s, params));
}

async function _doCreateCheckout(s: Stripe, params: {
  stripePriceId: string;
  organizationId: string;
  customerEmail: string;
  existingCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const meterPrices = getMeteredPriceIds();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: params.stripePriceId, quantity: 1 },
  ];
  // Attach metered items if configured. Metered prices have no quantity.
  for (const meterPrice of [
    meterPrices.callMinutes,
    meterPrices.leadsQualified,
    meterPrices.numberRental,
  ]) {
    if (meterPrice) lineItems.push({ price: meterPrice });
  }
  return s.checkout.sessions.create(
    {
      mode: "subscription",
      line_items: lineItems,
      customer: params.existingCustomerId || undefined,
      customer_email: params.existingCustomerId ? undefined : params.customerEmail,
      client_reference_id: params.organizationId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { organizationId: params.organizationId },
      subscription_data: {
        metadata: { organizationId: params.organizationId },
      },
    },
    { idempotencyKey: `checkout:${params.organizationId}:${params.stripePriceId}` }
  );
}

export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string
) {
  const s = await ensureStripe();
  return timeVendorCall("stripe", "portal.create", () =>
    s.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    })
  );
}

export async function verifyWebhook(rawBody: Buffer, signature: string) {
  const s = await ensureStripe();
  const secret = await getServiceSecret("STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
  return s.webhooks.constructEvent(rawBody, signature, secret);
}

// ---------- Metering ----------

export type MeterName = "call_minutes" | "leads_qualified" | "number_rental";

export function getMeteredPriceIds() {
  return {
    callMinutes: process.env.STRIPE_METER_CALL_MINUTES || "",
    leadsQualified: process.env.STRIPE_METER_LEADS_QUALIFIED || "",
    numberRental: process.env.STRIPE_METER_NUMBER_RENTAL || "",
  };
}

function meterToPriceId(meter: MeterName): string {
  const m = getMeteredPriceIds();
  switch (meter) {
    case "call_minutes":
      return m.callMinutes;
    case "leads_qualified":
      return m.leadsQualified;
    case "number_rental":
      return m.numberRental;
  }
}

/**
 * In-memory cache of the Stripe subscriptionItem id used for each
 * (org, meter) tuple. Populated lazily from the live Stripe subscription on
 * first use, and refreshed when subscription.updated fires.
 *
 * We deliberately keep this in memory (no schema migration) — the cache is
 * small (3 entries per org) and rebuilds in one Stripe API call after a
 * service restart.
 */
const meterItemCache = new Map<string, string>();

function cacheKey(orgId: string, meter: MeterName) {
  return `${orgId}::${meter}`;
}

export function setMeterItemCache(
  orgId: string,
  meter: MeterName,
  subscriptionItemId: string
) {
  meterItemCache.set(cacheKey(orgId, meter), subscriptionItemId);
}

export function clearMeterItemCacheForOrg(orgId: string) {
  for (const k of Array.from(meterItemCache.keys())) {
    if (k.startsWith(`${orgId}::`)) meterItemCache.delete(k);
  }
}

/**
 * Resolve (and cache) the Stripe subscriptionItem id for the given org+meter.
 * Returns null if the org has no Stripe subscription, or the subscription
 * doesn't include that meter.
 */
export async function resolveMeterItemId(
  orgId: string,
  stripeSubscriptionId: string,
  meter: MeterName
): Promise<string | null> {
  const cached = meterItemCache.get(cacheKey(orgId, meter));
  if (cached) return cached;

  const targetPrice = meterToPriceId(meter);
  if (!targetPrice) return null;

  const s = await ensureStripe();
  const sub = await s.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items.data.price"],
  });
  for (const item of sub.items.data) {
    const priceId = (item.price as Stripe.Price)?.id;
    if (priceId === targetPrice) {
      setMeterItemCache(orgId, meter, item.id);
      return item.id;
    }
  }
  return null;
}

/**
 * Ensure the live Stripe subscription has all configured metered items.
 * Idempotent — adds missing items, leaves existing ones alone.
 */
export async function ensureMeteredItems(stripeSubscriptionId: string, orgId: string) {
  const s = await ensureStripe();
  const sub = await s.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items.data.price"],
  });
  const existing = new Set<string>();
  for (const item of sub.items.data) {
    const pid = (item.price as Stripe.Price)?.id;
    if (pid) existing.add(pid);
    // Pre-populate the meter cache for any meters already on the sub
    const meters = getMeteredPriceIds();
    if (pid === meters.callMinutes) setMeterItemCache(orgId, "call_minutes", item.id);
    if (pid === meters.leadsQualified) setMeterItemCache(orgId, "leads_qualified", item.id);
    if (pid === meters.numberRental) setMeterItemCache(orgId, "number_rental", item.id);
  }

  const meters = getMeteredPriceIds();
  const desired: Array<{ priceId: string; meter: MeterName }> = [
    { priceId: meters.callMinutes, meter: "call_minutes" },
    { priceId: meters.leadsQualified, meter: "leads_qualified" },
    { priceId: meters.numberRental, meter: "number_rental" },
  ];

  for (const { priceId, meter } of desired) {
    if (!priceId || existing.has(priceId)) continue;
    try {
      const created = await s.subscriptionItems.create(
        {
          subscription: stripeSubscriptionId,
          price: priceId,
        },
        { idempotencyKey: `add-meter:${stripeSubscriptionId}:${meter}` }
      );
      setMeterItemCache(orgId, meter, created.id);
      logger.info(
        { meter, priceId, itemId: created.id, sub: stripeSubscriptionId },
        "[billing] attached meter"
      );
    } catch (err: any) {
      logger.error(
        { meter, sub: stripeSubscriptionId, err: err?.message },
        "[billing] failed to attach meter"
      );
    }
  }
}

/**
 * Report metered usage to Stripe. Idempotent via {orgId}:{meter}:{hourBucket}.
 *
 * @param hourBucket  caller-supplied bucket id (e.g. "2026-04-30T14"); identical
 *                    buckets dedupe via the Stripe idempotencyKey.
 */
export async function reportUsage(
  orgId: string,
  meter: MeterName,
  quantity: number,
  hourBucket: string
): Promise<{ ok: true; usageRecordId: string } | { ok: false; reason: string }> {
  if (quantity <= 0) return { ok: false, reason: "non-positive quantity" };

  const { prisma } = await import("@callora/shared");
  const sub = await prisma.subscription.findUnique({
    where: { organizationId: orgId },
    select: { stripeSubscriptionId: true },
  });
  if (!sub?.stripeSubscriptionId) {
    return { ok: false, reason: "no stripe subscription" };
  }

  const itemId = await resolveMeterItemId(orgId, sub.stripeSubscriptionId, meter);
  if (!itemId) return { ok: false, reason: `no item id for meter ${meter}` };

  const s = await ensureStripe();
  try {
    const rec = await timeVendorCall("stripe", "createUsageRecord", () =>
      s.subscriptionItems.createUsageRecord(
        itemId,
        {
          quantity: Math.round(quantity),
          action: "increment",
          timestamp: Math.floor(Date.now() / 1000),
        },
        { idempotencyKey: `usage:${orgId}:${meter}:${hourBucket}` }
      )
    );
    return { ok: true, usageRecordId: rec.id };
  } catch (err: any) {
    logger.error(
      { orgId, meter, hourBucket, err: err?.message },
      "[billing] reportUsage failed"
    );
    return { ok: false, reason: err?.message ?? "stripe error" };
  }
}
