import Link from "next/link";
import Card from "@/horizon-ui/components/card";
import { getSpendCap } from "@/app/actions/spend-cap";

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ProgressBar({
  current,
  cap,
  label,
}: {
  current: number;
  cap: number;
  label: string;
}) {
  const pct = cap > 0 ? Math.min(100, Math.round((current / cap) * 100)) : 0;
  const blocked = cap > 0 && current >= cap;
  const warning = !blocked && pct >= 80;

  const color = blocked
    ? "bg-red-500"
    : warning
      ? "bg-amber-500"
      : "bg-brand-500 dark:bg-brand-400";

  const statusLabel = blocked
    ? "Cap reached — calls paused"
    : warning
      ? "Approaching cap"
      : "Within cap";

  const statusClass = blocked
    ? "text-red-600 dark:text-red-400"
    : warning
      ? "text-amber-600 dark:text-amber-400"
      : "text-gray-500 dark:text-gray-400";

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-navy-700 dark:text-white">{label}</span>
        <span className="text-gray-500 dark:text-gray-400">
          {fmt(current)} / {cap > 0 ? fmt(cap) : "no cap"}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          role="progressbar"
        />
      </div>
      <p className={`mt-1 text-xs ${statusClass}`}>{statusLabel}</p>
    </div>
  );
}

/**
 * Settings → Usage & Spend Cap card. Pulls live counters from
 * billing-service `/internal/spend-cap/:orgId`. Falls back to a quiet
 * placeholder if the service is unreachable so the rest of the settings
 * page still renders.
 */
export default async function SpendCapCard() {
  const cap = await getSpendCap();

  return (
    <Card extra="p-0">
      <div className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Usage & Spend Cap
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Hard limits that pause outbound calling once you hit your cap.
            </p>
          </div>
          <Link
            href="/billing"
            className="text-sm font-semibold text-brand-500 hover:underline dark:text-brand-400"
          >
            Manage billing
          </Link>
        </div>
      </div>
      <div className="space-y-5 px-6 py-5">
        {cap ? (
          <>
            <ProgressBar
              label="Today"
              current={cap.currentDayCents}
              cap={cap.dailyCapCents}
            />
            <ProgressBar
              label="This month"
              current={cap.currentMonthCents}
              cap={cap.monthlyCapCents}
            />
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Usage data is temporarily unavailable. Refresh in a moment.
          </p>
        )}
      </div>
    </Card>
  );
}
