"use client";

import { useState } from "react";
import PaymentStep from "./_steps/PaymentStep";
import BusinessStep from "./_steps/BusinessStep";
import ProvisioningStep from "./_steps/ProvisioningStep";

interface WizardProps {
  initialStep: 1 | 2 | 3;
  initial: {
    aiCallerName: string;
    aiCallerCompany: string;
    aiSystemPrompt: string;
    provisioningStatus:
      | "PENDING"
      | "PROVISIONING"
      | "READY"
      | "FAILED"
      | "SUSPENDED"
      | "DEPROVISIONED";
    phoneNumberE164: string | null;
  };
}

const TITLES: Record<1 | 2 | 3, string> = {
  1: "Add your first $25 in calling credits",
  2: "Set up your AI caller",
  3: "Activating your account",
};

/**
 * Phase 5 Agent M6 — wizard shell. Tracks the current step locally so the
 * user can move forward without a full page reload between steps.
 */
export default function OnboardingWizard({ initialStep, initial }: WizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);

  return (
    <div className="flex min-h-screen w-full items-start justify-center bg-lightPrimary px-4 py-12 dark:bg-navy-900">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-center">
          <span className="font-poppins text-[32px] font-bold uppercase text-navy-700 dark:text-white">
            Callora
          </span>
        </div>

        <div className="rounded-[20px] bg-white p-8 shadow-3xl shadow-shadow-500 dark:!bg-navy-800 dark:shadow-none">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
              {TITLES[step]}
            </h1>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={
                    "h-2.5 w-2.5 rounded-full " +
                    (i <= step
                      ? "bg-brand-500 dark:bg-brand-400"
                      : "bg-gray-200 dark:bg-white/10")
                  }
                />
              ))}
              <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Step {step} of 3
              </span>
            </div>
          </div>

          {step === 1 ? (
            <PaymentStep onComplete={() => setStep(2)} />
          ) : null}
          {step === 2 ? (
            <BusinessStep
              initial={{
                aiCallerName: initial.aiCallerName,
                aiCallerCompany: initial.aiCallerCompany,
                aiSystemPrompt: initial.aiSystemPrompt,
              }}
              onComplete={() => setStep(3)}
            />
          ) : null}
          {step === 3 ? (
            <ProvisioningStep
              initialStatus={initial.provisioningStatus}
              initialPhoneNumber={initial.phoneNumberE164}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
