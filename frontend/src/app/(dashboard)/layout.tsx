import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

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
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        userName={session.user?.name || "User"}
        userEmail={session.user?.email || ""}
      />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
