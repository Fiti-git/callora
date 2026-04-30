import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOnboardingStatus } from "@/app/actions/onboarding";
import OnboardingWizard from "./wizard";

/**
 * Phase 5 Agent M6 — 3-step Model B onboarding wizard entry point.
 *
 * Decides which step to land on (server-side) and hands off to the client
 * wizard. Routing rules, in priority order:
 *
 *   1. No session                            -> /login
 *   2. Email not verified                    -> /verify-email-pending
 *   3. Provisioning READY                    -> /dashboard (already done)
 *   4. No payment method                     -> Step 1 (PaymentStep)
 *   5. No or too-short system prompt         -> Step 2 (BusinessStep)
 *   6. else                                  -> Step 3 (ProvisioningStep)
 */

interface PageProps {
  searchParams: Promise<{ step?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const status = await getOnboardingStatus();

  if (!status.emailVerified) {
    redirect("/verify-email-pending");
  }
  if (status.provisioningStatus === "READY") {
    redirect("/dashboard");
  }

  let initialStep: 1 | 2 | 3;
  if (!status.hasPaymentMethod) {
    initialStep = 1;
  } else if (
    !status.aiSystemPrompt ||
    status.aiSystemPrompt.trim().length < 50
  ) {
    initialStep = 2;
  } else {
    initialStep = 3;
  }

  // ?step=N override (for "back" buttons inside the wizard) — clamps to a
  // step the user is actually allowed on.
  const params = await searchParams;
  const requested = Number(params.step);
  if (Number.isFinite(requested) && requested >= 1 && requested <= 3) {
    if (requested === 1 || (requested === 2 && status.hasPaymentMethod)) {
      initialStep = requested as 1 | 2 | 3;
    }
  }

  return (
    <OnboardingWizard
      initialStep={initialStep}
      initial={{
        aiCallerName: status.aiCallerName ?? "Alex",
        aiCallerCompany: status.aiCallerCompany ?? "",
        aiSystemPrompt: status.aiSystemPrompt ?? "",
        provisioningStatus: status.provisioningStatus,
        phoneNumberE164: status.phoneNumberE164,
      }}
    />
  );
}
