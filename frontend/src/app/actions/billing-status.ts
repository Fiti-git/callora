"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API_URL = process.env.API_URL || "http://backend:4000/api";

export interface BillingStatus {
  orgStatus: string | null;
  dunning: {
    status: string;
    attempt: number;
    nextActionAt: string;
    invoiceId: string;
    amountDueCents: number | null;
    currency: string | null;
    firstFailedAt: string;
    lastEmailSentAt: string | null;
  } | null;
  // Phase 5 Agent M7 — PAYG balance + flags surfaced for the LowCredit /
  // NoCredit banners. These fields are missing on responses from older
  // backend builds; treat as `0` / absent in that case.
  balanceCents?: number;
  lowBalanceThresholdCents?: number;
  payg?: {
    isLowBalance: boolean;
    isOutOfCredits: boolean;
  };
}

/**
 * Fetches the caller's org status + dunning state from `/api/me/status`.
 * Uses the permissive backend endpoint that allows PAST_DUE/SUSPENDED orgs
 * through, which is required to render the failed-payment banner.
 *
 * Returns null when the user is unauthenticated or the call fails — callers
 * should treat null as "no banner".
 */
export async function getBillingStatus(): Promise<BillingStatus | null> {
  const session: any = await getServerSession(authOptions);
  const token = session?.user?.accessToken;
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/me/status`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as BillingStatus;
  } catch {
    return null;
  }
}

/** Triggers stripe.invoices.pay() against the caller's open dunning state. */
export async function payDunningNow(): Promise<{ paid: boolean; error?: string }> {
  const session: any = await getServerSession(authOptions);
  const token = session?.user?.accessToken;
  if (!token) return { paid: false, error: "Not authenticated" };

  const res = await fetch(`${API_URL}/billing/dunning/pay-now`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: "{}",
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { paid: false, error: data?.error ?? `HTTP ${res.status}` };
  }
  return { paid: !!data?.paid };
}

/** Opens a Stripe Customer Portal session and returns its redirect URL. */
export async function openBillingPortal(): Promise<{ url: string | null; error?: string }> {
  const session: any = await getServerSession(authOptions);
  const token = session?.user?.accessToken;
  if (!token) return { url: null, error: "Not authenticated" };

  const res = await fetch(`${API_URL}/billing/portal`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: "{}",
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { url: null, error: data?.error ?? `HTTP ${res.status}` };
  }
  return { url: data?.url ?? null };
}
