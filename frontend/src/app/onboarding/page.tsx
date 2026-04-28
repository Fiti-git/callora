import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOnboardingStatus } from "@/app/actions/onboarding";
import OnboardingChoosePlan from "./choose-plan";
import OnboardingSetupCaller from "./setup-caller";
import OnboardingPostCheckout from "./post-checkout";

interface PageProps {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const status = await getOnboardingStatus();

  // User landed back here from Stripe success — promote step before rendering.
  if (params?.success === "true" && status.onboardingStep === "choose_plan") {
    return <OnboardingPostCheckout />;
  }

  if (!status.emailVerified || status.onboardingStep === "verify_email") {
    redirect("/verify-email-pending");
  }

  if (status.onboardingStep === "complete") {
    redirect("/dashboard");
  }

  if (status.onboardingStep === "setup_caller") {
    return (
      <OnboardingShell step={2} totalSteps={2} title="Set up your AI caller">
        <OnboardingSetupCaller
          initial={{
            aiCallerName: status.aiCallerName ?? "Alex",
            aiCallerCompany: status.aiCallerCompany ?? "",
            aiSystemPrompt: status.aiSystemPrompt ?? "",
            vapiPhoneNumber: status.vapiPhoneNumber ?? null,
          }}
        />
      </OnboardingShell>
    );
  }

  // Default: choose_plan
  return (
    <OnboardingShell step={1} totalSteps={2} title="Choose your plan">
      <OnboardingChoosePlan />
    </OnboardingShell>
  );
}

function OnboardingShell({
  step,
  totalSteps,
  title,
  children,
}: {
  step: number;
  totalSteps: number;
  title: string;
  children: React.ReactNode;
}) {
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
              {title}
            </h1>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span
                  key={i}
                  className={
                    "h-2.5 w-2.5 rounded-full " +
                    (i + 1 <= step
                      ? "bg-brand-500 dark:bg-brand-400"
                      : "bg-gray-200 dark:bg-white/10")
                  }
                />
              ))}
              <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Step {step} of {totalSteps}
              </span>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
