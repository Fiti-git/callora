import Link from "next/link";
import { format } from "date-fns";
import { listCampaigns } from "@/app/actions/email-marketing";
import { formatPct, statusBadge } from "./_lib/format";

export const dynamic = "force-dynamic";

export default async function EmailMarketingOverviewPage() {
  let items: any[] = [];
  try {
    const res = await listCampaigns({ limit: 200 });
    items = res.items ?? [];
  } catch (err) {
    console.error("Email marketing overview:", err);
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        Failed to load email marketing overview.
      </div>
    );
  }

  // Aggregate this month's stats from campaign rows.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = items.filter(
    (c) => c.sentAt && new Date(c.sentAt) >= monthStart
  );
  const sentThisMonth = thisMonth.reduce(
    (acc, c) => acc + (c.totalSent ?? 0),
    0
  );
  const sentCampaigns = thisMonth.filter((c) => c.status === "SENT");
  const avgOpenRate =
    sentCampaigns.length > 0
      ? sentCampaigns.reduce((acc, c) => {
          const sent = Math.max(c.totalSent ?? 0, 1);
          return acc + (c.totalOpened ?? 0) / sent;
        }, 0) / sentCampaigns.length
      : null;
  const avgClickRate =
    sentCampaigns.length > 0
      ? sentCampaigns.reduce((acc, c) => {
          const sent = Math.max(c.totalSent ?? 0, 1);
          return acc + (c.totalClicked ?? 0) / sent;
        }, 0) / sentCampaigns.length
      : null;

  // TODO(Agent 12): wire emails-quota into /api/me/status when it exposes a
  // dedicated EMAIL quota field.
  const quotaText = "—";

  const recent = items.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Email Marketing</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Send campaigns, manage lists, and run automations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/email-marketing/lists/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            New List
          </Link>
          <Link
            href="/email-marketing/campaigns/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Campaign
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sent this month" value={sentThisMonth.toLocaleString()} />
        <StatCard label="Avg open rate" value={formatPct(avgOpenRate)} />
        <StatCard label="Avg click rate" value={formatPct(avgClickRate)} />
        <StatCard label="Quota this month" value={quotaText} />
      </div>

      {/* Recent campaigns */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent campaigns</h2>
          <Link
            href="/email-marketing/campaigns"
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all
          </Link>
        </div>
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Recipients</Th>
              <Th>Open rate</Th>
              <Th>Click rate</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {recent.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  No campaigns yet.
                </td>
              </tr>
            ) : (
              recent.map((c) => {
                const sent = Math.max(c.totalSent ?? 0, 1);
                const openRate = c.totalOpened ? (c.totalOpened ?? 0) / sent : 0;
                const clickRate = c.totalClicked ? (c.totalClicked ?? 0) / sent : 0;
                return (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-6 py-3">
                      <Link
                        href={`/email-marketing/campaigns/${c.id}`}
                        className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {(c.totalRecipients ?? 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {c.totalSent ? formatPct(openRate) : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {c.totalSent ? formatPct(clickRate) : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {format(new Date(c.createdAt), "MMM d, yyyy")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
      {children}
    </th>
  );
}
