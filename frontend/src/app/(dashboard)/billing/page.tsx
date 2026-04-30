import Link from "next/link";
import { getCredits, getTransactions } from "@/app/actions/billing";
import { getBillingStatus } from "@/app/actions/billing-status";
import PaygBillingControls from "@/components/payg-billing-controls";

/**
 * Phase 5 Agent M7 — PAYG-first billing dashboard.
 *
 * Replaces the old plan-list / Stripe-Portal-only page. Subscription
 * subroutes (dunning, portal, upgrade) keep their own URLs so this page
 * focuses on what every PAYG tenant needs: balance, top-up, transactions,
 * auto-recharge.
 */

function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function statusPill(
  balanceCents: number,
  isOutOfCredits: boolean,
  thresholdCents: number
) {
  if (isOutOfCredits) {
    return (
      <span className="ml-3 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-600 text-white">
        OUT OF CREDITS
      </span>
    );
  }
  if (balanceCents > 0 && balanceCents < thresholdCents) {
    return (
      <span className="ml-3 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-amber-950">
        LOW BALANCE
      </span>
    );
  }
  return (
    <span className="ml-3 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-600 text-white">
      ACTIVE
    </span>
  );
}

export default async function BillingPage() {
  const [credits, transactions, status] = await Promise.all([
    getCredits(),
    getTransactions(undefined, 50),
    getBillingStatus(),
  ]);

  if (!credits) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-2">Billing</h1>
        <p className="text-slate-400">Unable to load billing data. Please sign in or try again.</p>
      </div>
    );
  }

  const thresholdCents = status?.lowBalanceThresholdCents ?? 1000;
  const isOutOfCredits = status?.payg?.isOutOfCredits ?? false;

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Billing</h1>
        <div className="text-xs text-slate-400 space-x-3">
          <Link href="/billing/portal" className="underline hover:text-slate-200">
            Customer portal
          </Link>
          <Link href="/billing/dunning" className="underline hover:text-slate-200">
            Dunning history
          </Link>
        </div>
      </div>

      {/* Balance card */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
        <div className="flex items-baseline">
          <span className="text-sm text-slate-400">Credit balance</span>
          {statusPill(credits.balanceCents, isOutOfCredits, thresholdCents)}
        </div>
        <div className="text-5xl font-bold mt-2">
          {dollars(credits.balanceCents)}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Low-balance alert at {dollars(thresholdCents)}.
        </div>
        <div className="mt-6">
          <PaygBillingControls credits={credits} />
        </div>
      </div>

      {/* Transactions */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Recent transactions</h2>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
          {!transactions || transactions.transactions.length === 0 ? (
            <p className="p-6 text-slate-400 text-sm">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-300">Date</th>
                  <th className="text-left p-3 font-medium text-slate-300">Type</th>
                  <th className="text-right p-3 font-medium text-slate-300">Amount</th>
                  <th className="text-right p-3 font-medium text-slate-300">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {transactions.transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-slate-800">
                    <td className="p-3 text-slate-400">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">{tx.display}</td>
                    <td
                      className={`p-3 text-right font-mono ${
                        tx.amountCents < 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {dollars(tx.amountCents)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      {dollars(tx.balanceAfterCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {transactions?.nextCursor && (
          <p className="text-xs text-slate-500 mt-2">
            Showing latest 50 transactions. Older entries are available via
            the customer portal.
          </p>
        )}
      </section>

      <p className="text-xs text-slate-500">
        <Link href="/privacy" className="underline hover:text-slate-300">
          View our Privacy Policy
        </Link>{" "}
        to understand how payment data is handled.
      </p>
    </div>
  );
}
