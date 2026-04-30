import Link from "next/link";

/**
 * Phase 5 Agent M7 — PAYG credit banners. Render a single banner at most:
 * NoCredit (red, blocking) takes priority over LowCredit (yellow, warning).
 * Both link to /billing where the customer can top up.
 *
 * The banners are server components (no client interactivity) and read from
 * the same `/api/me/status` payload that powers BillingStatusBanner. Status
 * is fetched once per request in (dashboard)/layout.tsx.
 */
interface Props {
  isOutOfCredits?: boolean;
  isLowBalance?: boolean;
  balanceCents?: number;
}

function dollars(cents: number | undefined): string {
  if (typeof cents !== "number") return "0.00";
  return (cents / 100).toFixed(2);
}

export default function CreditBanners({
  isOutOfCredits,
  isLowBalance,
  balanceCents,
}: Props) {
  if (isOutOfCredits) {
    return (
      <div className="bg-red-600 text-white text-sm py-2 px-4 flex items-center justify-center gap-3">
        <strong>Out of credits:</strong>
        <span>Calls and emails are paused until you top up.</span>
        <Link
          href="/billing"
          className="ml-2 px-3 py-1 rounded bg-black/80 hover:bg-black text-white text-xs font-semibold"
        >
          Add credits
        </Link>
      </div>
    );
  }
  if (isLowBalance) {
    return (
      <div className="bg-amber-500 text-amber-950 text-sm py-2 px-4 flex items-center justify-center gap-3">
        <strong>Low balance:</strong>
        <span>${dollars(balanceCents)} remaining.</span>
        <Link
          href="/billing"
          className="ml-2 px-3 py-1 rounded bg-black/80 hover:bg-black text-white text-xs font-semibold"
        >
          Add credits
        </Link>
      </div>
    );
  }
  return null;
}
