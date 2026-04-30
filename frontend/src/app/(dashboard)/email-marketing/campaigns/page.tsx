import Link from "next/link";
import { format } from "date-fns";
import { listCampaigns } from "@/app/actions/email-marketing";
import { formatPct, statusBadge } from "../_lib/format";

const TABS = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Sending", value: "SENDING" },
  { label: "Sent", value: "SENT" },
  { label: "Paused", value: "PAUSED" },
];

export const dynamic = "force-dynamic";

export default async function CampaignsListPage({
  searchParams,
}: {
  searchParams: { status?: string; cursor?: string };
}) {
  const status = searchParams.status || "";
  const cursor = searchParams.cursor || undefined;

  let res: any = { items: [], nextCursor: null };
  try {
    res = await listCampaigns({ status: status || undefined, cursor, limit: 50 });
  } catch (err) {
    console.error("Campaigns list:", err);
  }
  const campaigns: any[] = res.items ?? [];
  const nextCursor: string | null = res.nextCursor ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Email Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">All your email campaigns.</p>
        </div>
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

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        {TABS.map((t) => {
          const active = (status || "") === t.value;
          const href = t.value
            ? `/email-marketing/campaigns?status=${t.value}`
            : "/email-marketing/campaigns";
          return (
            <Link
              key={t.value || "all"}
              href={href}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Recipients</Th>
              <Th>Sent</Th>
              <Th>Open rate</Th>
              <Th>Click rate</Th>
              <Th>Date</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                  No campaigns found.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => {
                const sent = Math.max(c.totalSent ?? 0, 1);
                const openRate = c.totalOpened ? (c.totalOpened ?? 0) / sent : 0;
                const clickRate = c.totalClicked ? (c.totalClicked ?? 0) / sent : 0;
                const dateLabel = c.sentAt
                  ? `Sent ${format(new Date(c.sentAt), "MMM d")}`
                  : c.scheduledAt
                  ? `Scheduled ${format(new Date(c.scheduledAt), "MMM d")}`
                  : `Created ${format(new Date(c.createdAt), "MMM d")}`;
                return (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-6 py-3">
                      <Link
                        href={`/email-marketing/campaigns/${c.id}`}
                        className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-md">
                        {c.subject}
                      </p>
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
                      {(c.totalSent ?? 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {c.totalSent ? formatPct(openRate) : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {c.totalSent ? formatPct(clickRate) : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">{dateLabel}</td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/email-marketing/campaigns/${c.id}`}
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="flex justify-end">
          <Link
            href={`/email-marketing/campaigns?${
              status ? `status=${status}&` : ""
            }cursor=${nextCursor}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-6 py-3 ${
        align === "right" ? "text-right" : "text-left"
      } text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}
    >
      {children}
    </th>
  );
}
