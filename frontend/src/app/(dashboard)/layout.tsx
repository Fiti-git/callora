import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import HorizonShell from "@/components/horizon-shell";
import { ToastProvider } from "@/components/ui/toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
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
