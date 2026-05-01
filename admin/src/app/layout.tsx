import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const metadata = { title: "Callora Admin" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en">
      <body>
        {session ? (
          <div className="min-h-screen flex">
            <aside className="w-60 bg-slate-900 border-r border-slate-800 p-4 space-y-2">
              <div className="text-xl font-bold mb-4">Callora Admin</div>
              <Link className="block hover:text-cyan-400" href="/">Dashboard</Link>
              <Link className="block hover:text-cyan-400" href="/tenants">Tenants</Link>
              <Link className="block hover:text-cyan-400" href="/plans">Plans</Link>
              <Link className="block hover:text-cyan-400" href="/numbers">Number Pool</Link>
              <Link className="block hover:text-cyan-400" href="/spend-caps">Spend Caps</Link>
              <Link className="block hover:text-cyan-400" href="/anomalies">Anomalies</Link>
              <Link className="block hover:text-cyan-400" href="/dnc">DNC List</Link>
              <Link className="block hover:text-cyan-400" href="/audit">Audit Log</Link>
              <Link className="block hover:text-cyan-400" href="/secrets">Secrets</Link>
            </aside>
            <main className="flex-1 p-8">{children}</main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
