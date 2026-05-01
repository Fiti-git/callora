/**
 * Lazy Stripe client for crm-service. Used by the GDPR export/delete flow to
 * fetch the tenant's invoice history and cancel the subscription before
 * anonymising local data.
 *
 * The Stripe key is read from the env at first use. If it is missing, callers
 * receive a thrown Error — the GDPR export tolerates this (records the error
 * in `billingHistory._error`); the GDPR delete aborts with 502.
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function ensureStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe not configured: STRIPE_SECRET_KEY missing");
  }
  _stripe = new Stripe(key, { apiVersion: "2024-06-20" as any });
  return _stripe;
}
