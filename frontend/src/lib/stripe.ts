"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Phase 5 Agent M6 — memoised Stripe.js loader.
 *
 * `loadStripe` returns a Promise on first call and reuses the same instance
 * thereafter (it's cached internally), but we still memoise the publishable
 * key check + key read here so a missing env var produces ONE clear error
 * instead of a confusing failure deep in Stripe Elements.
 */

let cached: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (cached) return cached;
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    // No fallback — fail loud. The wizard surfaces this through its
    // error-boundary; the user sees a brand-clean "Payment system unavailable"
    // line rather than a silent dead button.
    throw new Error("Payment system unavailable. Please contact support.");
  }
  cached = loadStripe(key);
  return cached;
}
