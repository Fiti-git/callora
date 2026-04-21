import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API = process.env.API_URL || "http://localhost:4000/api";

async function fetchMe(token: string) {
  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function BillingPage() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.accessToken) return <p>Please sign in.</p>;

  const me = await fetchMe(session.user.accessToken);
  const sub = me?.organization?.subscription;
  const trialEnd = sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Billing</h1>

      <div className="rounded-xl border p-4">
        <div className="text-sm opacity-70">Current Plan</div>
        <div className="text-xl font-semibold">
          {sub?.plan?.name ?? "No plan"}{" "}
          <span className="text-sm opacity-60">({sub?.status ?? "—"})</span>
        </div>
        <div className="text-sm opacity-70 mt-1">
          Org status: <strong>{me?.organization?.status}</strong>
          {trialEnd && (
            <> · Trial ends {trialEnd.toLocaleDateString()}</>
          )}
        </div>
      </div>

      <form action="/billing/upgrade" method="post" className="flex gap-3 flex-wrap">
        {["STARTER", "PRO", "ENTERPRISE"].map((tier) => (
          <button
            key={tier}
            name="planTier"
            value={tier}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded"
          >
            Upgrade to {tier}
          </button>
        ))}
      </form>

      <form action="/billing/portal" method="post">
        <button className="border px-4 py-2 rounded">Manage Billing (Stripe Portal)</button>
      </form>

      <p className="text-xs text-gray-500 mt-2">
        <Link href="/privacy" className="underline hover:text-gray-700">View our Privacy Policy</Link>
        {" "}to understand how payment data is handled.
      </p>
    </div>
  );
}
