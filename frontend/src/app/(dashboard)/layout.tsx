import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import HorizonShell from "@/components/horizon-shell";
import { ToastProvider } from "@/components/ui/toast";
import {
  getOnboardingStatus,
  type OnboardingStatus,
} from "@/app/actions/onboarding";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  // Gate the dashboard on email verification + onboarding completion. If the
  // settings endpoint is unreachable, fall through and render the dashboard
  // rather than redirect-loop the user.
  let status: OnboardingStatus | null = null;
  try {
    status = await getOnboardingStatus();
  } catch {
    status = null;
  }

  if (status) {
    if (status.emailVerified === false) {
      redirect("/verify-email-pending");
    }
    if (status.onboardingStep !== "complete") {
      redirect("/onboarding");
    }
  }

  return (
    <ToastProvider>
      <HorizonShell
        userName={session.user?.name || "User"}
        userEmail={session.user?.email || ""}
      >
        {children}
      </HorizonShell>
    </ToastProvider>
  );
}
