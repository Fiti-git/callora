import Link from "next/link";
import { cookies } from "next/headers";
import { PLATFORM_COOKIE } from "@/lib/platformApi";
import { logoutAction } from "./logoutAction";
import type { ReactNode } from "react";

export const metadata = { title: "Callora Admin" };

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const c = await cookies();
  const hasToken = !!c.get(PLATFORM_COOKIE)?.value;

  if (!hasToken) {
    return <div className="bg-slate-950 min-h-screen text-white">{children}</div>;
  }

  return (
    <div className="bg-slate-950 min-h-screen text-white flex">
      <aside className="w-60 bg-slate-900 border-r border-slate-800 p-4 space-y-2">
        <div className="text-xl font-bold mb-4">Callora Admin</div>
        <Link className="block hover:text-cyan-400" href="/admin">Dashboard</Link>
        <Link className="block hover:text-cyan-400" href="/admin/tenants">Tenants</Link>
        <Link className="block hover:text-cyan-400" href="/admin/plans">Plans</Link>
        <Link className="block hover:text-cyan-400" href="/admin/numbers">Number Pool</Link>
        <Link className="block hover:text-cyan-400" href="/admin/spend-caps">Spend Caps</Link>
        <Link className="block hover:text-cyan-400" href="/admin/anomalies">Anomalies</Link>
        <Link className="block hover:text-cyan-400" href="/admin/dnc">DNC List</Link>
        <Link className="block hover:text-cyan-400" href="/admin/audit">Audit Log</Link>
        <Link className="block hover:text-cyan-400" href="/admin/secrets">Secrets</Link>
        <form action={logoutAction} className="pt-6">
          <button className="text-sm text-slate-400 hover:text-red-400">Sign out</button>
        </form>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
