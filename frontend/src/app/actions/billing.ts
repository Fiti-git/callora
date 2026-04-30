"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API_URL = process.env.API_URL || "http://backend:4000/api";

async function token(): Promise<string | null> {
  const session: any = await getServerSession(authOptions);
  return session?.user?.accessToken ?? null;
}

export interface CreditsSummary {
  balanceCents: number;
  autoRechargeEnabled: boolean;
  autoRechargeThresholdCents: number;
  autoRechargeAmountCents: number;
  hasPaymentMethod: boolean;
}

export interface CreditTransaction {
  id: string;
  kind: string;
  display: string;
  amountCents: number;
  balanceAfterCents: number;
  ref: string | null;
  createdAt: string;
}

export interface TransactionsPage {
  transactions: CreditTransaction[];
  nextCursor: string | null;
}

/** Fetches the caller's PAYG credit summary. Returns null on auth/network failure. */
export async function getCredits(): Promise<CreditsSummary | null> {
  const t = await token();
  if (!t) return null;
  try {
    const res = await fetch(`${API_URL}/billing/credits`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as CreditsSummary;
  } catch {
    return null;
  }
}

export async function getTransactions(
  cursor?: string,
  limit = 50
): Promise<TransactionsPage | null> {
  const t = await token();
  if (!t) return null;
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  try {
    const res = await fetch(
      `${API_URL}/billing/credits/transactions?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as TransactionsPage;
  } catch {
    return null;
  }
}

/**
 * Triggers a server-side $25 top-up. The backend rejects any other amount
 * at launch so we always pass 2500. Returns the Stripe PaymentIntent
 * status so the UI can branch on `requires_action` vs `succeeded`.
 */
export async function addCredits(
  amountCents: number = 2500
): Promise<{ ok: boolean; paymentIntentId?: string; status?: string; error?: string }> {
  const t = await token();
  if (!t) return { ok: false, error: "Not authenticated" };
  try {
    const res = await fetch(`${API_URL}/billing/credits/topup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ amountCents }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      paymentIntentId: data?.paymentIntentId,
      status: data?.status,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Top-up failed" };
  }
}

export async function updateAutoRecharge(args: {
  enabled: boolean;
  thresholdCents: number;
  amountCents: number;
}): Promise<{ ok: boolean; error?: string }> {
  const t = await token();
  if (!t) return { ok: false, error: "Not authenticated" };
  try {
    const res = await fetch(`${API_URL}/billing/credits/auto-recharge`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Update failed" };
  }
}

/** Mints a fresh SetupIntent so the customer can replace their card. */
export async function createSetupIntentForUpdate(): Promise<{
  clientSecret: string | null;
  error?: string;
}> {
  const t = await token();
  if (!t) return { clientSecret: null, error: "Not authenticated" };
  try {
    const res = await fetch(`${API_URL}/billing/credits/setup-intent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { clientSecret: null, error: data?.error ?? `HTTP ${res.status}` };
    }
    return { clientSecret: data?.clientSecret ?? null };
  } catch (err: any) {
    return { clientSecret: null, error: err?.message ?? "Setup-intent failed" };
  }
}

export async function attachPaymentMethod(
  paymentMethodId: string
): Promise<{ ok: boolean; error?: string }> {
  const t = await token();
  if (!t) return { ok: false, error: "Not authenticated" };
  try {
    const res = await fetch(`${API_URL}/billing/credits/payment-method`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ paymentMethodId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Attach failed" };
  }
}
