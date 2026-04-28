"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export interface OnboardingStatus {
  onboardingStep: "verify_email" | "choose_plan" | "setup_caller" | "complete";
  emailVerified: boolean;
  aiCallerName?: string;
  aiCallerCompany?: string;
  aiSystemPrompt?: string | null;
  vapiPhoneNumber?: string | null;
}

// Reads onboarding status from the backend settings endpoint. The backend
// is expected to expose `onboardingStep` and `emailVerified` on the settings
// payload (org-level fields). If a dedicated endpoint is added later, swap
// the path here.
//
// Defensive default: when the backend hasn't yet been updated to surface
// these fields, treat the org as already-onboarded so existing users aren't
// redirect-looped out of the dashboard.
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const data = await fetchWithAuth("/settings");
  const hasOnboardingFields =
    data && (data.onboardingStep !== undefined || data.emailVerified !== undefined);

  if (!hasOnboardingFields) {
    return {
      onboardingStep: "complete",
      emailVerified: true,
      aiCallerName: data?.aiCallerName,
      aiCallerCompany: data?.aiCallerCompany,
      aiSystemPrompt: data?.aiSystemPrompt ?? null,
    };
  }

  return {
    onboardingStep: data?.onboardingStep ?? "verify_email",
    emailVerified: Boolean(data?.emailVerified),
    aiCallerName: data?.aiCallerName,
    aiCallerCompany: data?.aiCallerCompany,
    aiSystemPrompt: data?.aiSystemPrompt ?? null,
    vapiPhoneNumber: data?.vapiPhoneNumber ?? null,
  };
}

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
