import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button"; // We'll create this

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
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md flex flex-col">
        <div className="h-16 flex items-center justify-center border-b px-4">
          <h1 className="text-xl font-bold text-indigo-600">EzLeads.ai</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/campaigns" label="Campaigns" />
          <NavLink href="/leads" label="Leads" />
          <NavLink href="/settings" label="Settings" />
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
              {session.user?.name?.[0] || "U"}
            </div>
            <div className="text-sm font-medium truncate">
              {session.user?.name || "User"}
            </div>
          </div>
          <SignOutButton />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-indigo-600 rounded-md transition-colors"
    >
      {label}
    </Link>
  );
}
