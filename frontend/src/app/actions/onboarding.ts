"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

/**
 * Phase 5 Agent M6 — onboarding wizard server actions.
 *
 * The wizard is a 3-step flow:
 *   1. PaymentStep    — Stripe SetupIntent + first $25 top-up
 *   2. BusinessStep   — caller persona (saved to Organization)
 *   3. ProvisioningStep — polls /api/me/provisioning-status until READY
 *
 * Every backend hop goes through `fetchWithAuth` so the user's NextAuth
 * session JWT travels as Authorization: Bearer <token>.
 */

export interface OnboardingStatus {
  // Original Phase-4 onboarding fields (kept for back-compat with existing
  // settings-driven UI). The wizard uses the provisioning-status endpoint.
  onboardingStep?: "verify_email" | "choose_plan" | "setup_caller" | "complete";
  emailVerified: boolean;
  aiCallerName?: string;
  aiCallerCompany?: string;
  aiSystemPrompt?: string | null;
  // M6 additions:
  hasPaymentMethod: boolean;
  provisioningStatus:
    | "PENDING"
    | "PROVISIONING"
    | "READY"
    | "FAILED"
    | "SUSPENDED"
    | "DEPROVISIONED";
  phoneNumberE164: string | null;
}

/**
 * Combined status: settings + credits + provisioning. Wizard's `page.tsx`
 * uses this to pick the right step on first paint.
 */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const [settings, credits, provisioning] = await Promise.all([
    fetchWithAuth("/settings").catch(() => ({})),
    fetchWithAuth("/billing/credits").catch(() => ({ hasPaymentMethod: false })),
    fetchWithAuth("/me/provisioning-status").catch(() => ({
      status: "PENDING",
      phoneNumberE164: null,
    })),
  ]);

  return {
    onboardingStep: settings?.onboardingStep,
    emailVerified: Boolean(settings?.emailVerified ?? true),
    aiCallerName: settings?.aiCallerName,
    aiCallerCompany: settings?.aiCallerCompany,
    aiSystemPrompt: settings?.aiSystemPrompt ?? null,
    hasPaymentMethod: Boolean(credits?.hasPaymentMethod),
    provisioningStatus: (provisioning?.status as OnboardingStatus["provisioningStatus"]) ?? "PENDING",
    phoneNumberE164: provisioning?.phoneNumberE164 ?? null,
  };
}

export async function createSetupIntent(): Promise<{ clientSecret: string }> {
  const data = await fetchWithAuth("/billing/credits/setup-intent", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!data?.clientSecret) {
    throw new Error("Could not start payment setup. Please try again.");
  }
  return { clientSecret: data.clientSecret };
}

export async function attachPaymentMethod(paymentMethodId: string): Promise<{ ok: true }> {
  await fetchWithAuth("/billing/credits/payment-method", {
    method: "POST",
    body: JSON.stringify({ paymentMethodId }),
  });
  return { ok: true };
}

export async function chargeFirstTopUp(): Promise<{ paymentIntentId: string; status: string }> {
  return await fetchWithAuth("/billing/credits/topup", {
    method: "POST",
    body: JSON.stringify({ amountCents: 2500 }),
  });
}

export async function startProvisioning(): Promise<{ enqueued: true }> {
  const data = await fetchWithAuth("/me/provisioning/start", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data;
}

export async function retryProvisioning(): Promise<{ enqueued: true }> {
  const data = await fetchWithAuth("/me/provisioning/retry", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data;
}

export async function saveBusinessProfile(input: {
  aiCallerName: string;
  aiCallerCompany: string;
  aiSystemPrompt: string;
}): Promise<{ ok: true }> {
  await fetchWithAuth("/me/business-profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  revalidatePath("/onboarding");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Legacy actions (kept until M7 deletes the old plan-picker).
// ---------------------------------------------------------------------------

export async function markPlanChosen(): Promise<{ success: true }> {
  await fetchWithAuth("/settings", {
    method: "PATCH",
    body: JSON.stringify({ onboardingStep: "setup_caller" }),
  });
  revalidatePath("/onboarding");
  return { success: true };
}

export async function saveCallerSettings(data: {
  aiCallerName: string;
  aiCallerCompany: string;
  aiSystemPrompt: string;
}): Promise<{ success: true }> {
  await fetchWithAuth("/settings", {
    method: "PATCH",
    body: JSON.stringify({
      aiCallerName: data.aiCallerName,
      aiCallerCompany: data.aiCallerCompany,
      aiSystemPrompt: data.aiSystemPrompt,
      onboardingStep: "complete",
    }),
  });
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function startCheckout(
  tier: "STARTER" | "PRO" | "ENTERPRISE"
): Promise<{ url: string }> {
  const data = await fetchWithAuth("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ planTier: tier }),
  });
  if (!data?.url) {
    throw new Error("Checkout URL not returned by billing service.");
  }
  return { url: data.url };
}
