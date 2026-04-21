import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API = process.env.API_URL || "http://localhost:4000/api";

export default async function TrialBanner() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.accessToken) return null;

  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${session.user.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const me = await res.json();
  const status = me?.organization?.status;
  const sub = me?.organization?.subscription;

  if (status === "TRIAL" && sub?.trialEndsAt) {
    const days = Math.max(
      0,
      Math.ceil(
        (new Date(sub.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    );
    return (
      <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-100 text-sm py-2 px-4 text-center">
        Trial ends in {days} day{days === 1 ? "" : "s"}.{" "}
        <Link href="/billing" className="underline font-semibold">
          Upgrade now
        </Link>
      </div>
    );
  }
  if (status === "PAST_DUE") {
    return (
      <div className="bg-red-500/20 border-b border-red-500/40 text-red-100 text-sm py-2 px-4 text-center">
        Payment past due.{" "}
        <Link href="/billing" className="underline font-semibold">
          Update billing
        </Link>
      </div>
    );
  }
  return null;
}
