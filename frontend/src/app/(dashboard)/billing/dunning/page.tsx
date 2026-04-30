import { getBillingStatus } from "@/app/actions/billing-status";
import DunningActions from "./dunning-actions";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function fmtCurrency(amountCents: number | null, currency: string | null): string {
  if (amountCents == null || currency == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  ACTIVE: "We've recorded your failed payment. We'll retry the charge automatically in 3 days.",
  RETRY_SCHEDULED: "Our first retry didn't go through. We'll try one more time in 4 days.",
  WARNED: "Both automatic retries failed. Your account will be suspended in 3 days if this isn't resolved.",
  SUSPENDED: "Your account is currently suspended. Update your payment method or pay now to restore access.",
};

export default async function DunningPage() {
  const data = await getBillingStatus();
  const dunning = data?.dunning;
  const orgStatus = data?.orgStatus;

  if (!dunning) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-semibold mb-4">Billing status</h1>
        <p className="text-sm text-zinc-400">
          No payment issues detected. Your account is in good standing.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Payment issue</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {STATUS_DESCRIPTIONS[dunning.status] ?? "Your account has an open payment issue."}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-zinc-500">Status</div>
          <div className="font-medium">{dunning.status}</div>

          <div className="text-zinc-500">Org status</div>
          <div className="font-medium">{orgStatus ?? "—"}</div>

          <div className="text-zinc-500">Attempt</div>
          <div className="font-medium">{dunning.attempt}</div>

          <div className="text-zinc-500">Amount due</div>
          <div className="font-medium">
            {fmtCurrency(dunning.amountDueCents, dunning.currency)}
          </div>

          <div className="text-zinc-500">First failed</div>
          <div className="font-medium">{fmtDate(dunning.firstFailedAt)}</div>

          <div className="text-zinc-500">Last email sent</div>
          <div className="font-medium">{fmtDate(dunning.lastEmailSentAt)}</div>

          <div className="text-zinc-500">Next retry / action</div>
          <div className="font-medium">{fmtDate(dunning.nextActionAt)}</div>
        </div>
      </div>

      <DunningActions />
    </div>
  );
}
