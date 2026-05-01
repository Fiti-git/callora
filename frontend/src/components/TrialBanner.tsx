import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API = process.env.API_URL || "http://localhost:4000/api";

/**
 * Shown above the dashboard for orgs in TRIAL status. Trial accounts use a
 * shared pool number; upgrading promotes the org to a dedicated number and
 * higher quotas.
 */
export default async function TrialBanner() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.accessToken) return null;

  let me: any = null;
  try {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${session.user.accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    me = await res.json();
  } catch {
    return null;
  }

  const status = me?.organization?.status;
  if (status !== "TRIAL") return null;

  return (
    <div className="flex flex-col items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-900 dark:text-amber-100 sm:flex-row">
      <span className="text-center sm:text-left">
        You&apos;re on a 14-day trial using a shared phone number. Upgrade for
        your own dedicated number and higher quotas.
      </span>
      <Link
        href="/billing"
        className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600"
      >
        Upgrade
      </Link>
    </div>
  );
}
