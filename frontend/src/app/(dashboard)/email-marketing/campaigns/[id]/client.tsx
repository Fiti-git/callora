"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { useToast } from "@/components/ui/toast";
import { statusBadge, formatPct } from "../../_lib/format";
import {
  pauseCampaign,
  resumeCampaign,
  deleteCampaign,
  getCampaignRecipients,
} from "@/app/actions/email-marketing";

const RECIPIENT_STATUSES = [
  "",
  "PENDING",
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "COMPLAINED",
  "FAILED",
];

export function CampaignDetailClient({
  campaign,
  analytics,
}: {
  campaign: any;
  analytics: any;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [recipients, setRecipients] = useState<any[]>([]);
  const [recipientCursor, setRecipientCursor] = useState<string | null>(null);
  const [recipientStatus, setRecipientStatus] = useState<string>("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void loadRecipients(true, recipientStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientStatus]);

  async function loadRecipients(reset: boolean, status: string) {
    setLoadingMore(true);
    try {
      const res = await getCampaignRecipients(campaign.id, {
        status: status || undefined,
        cursor: reset ? undefined : recipientCursor || undefined,
        limit: 50,
      });
      setRecipients((prev) => (reset ? res.items : [...prev, ...res.items]));
      setRecipientCursor(res.nextCursor);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to load recipients");
    } finally {
      setLoadingMore(false);
    }
  }

  function onPause() {
    startTransition(async () => {
      try {
        await pauseCampaign(campaign.id);
        router.refresh();
      } catch (err: any) {
        showToast("error", err?.message || "Failed to pause");
      }
    });
  }

  function onResume() {
    startTransition(async () => {
      try {
        await resumeCampaign(campaign.id);
        router.refresh();
      } catch (err: any) {
        showToast("error", err?.message || "Failed to resume");
      }
    });
  }

  function onDelete() {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    startTransition(async () => {
      try {
        await deleteCampaign(campaign.id);
        showToast("success", "Campaign deleted");
        router.push("/email-marketing/campaigns");
      } catch (err: any) {
        showToast("error", err?.message || "Failed to delete");
      }
    });
  }

  async function onExport() {
    setExporting(true);
    try {
      const cap = 5000;
      const collected: any[] = [];
      let cursor: string | undefined = undefined;
      let truncated = false;
      while (collected.length < cap) {
        const res: any = await getCampaignRecipients(campaign.id, {
          status: recipientStatus || undefined,
          cursor,
          limit: 200,
        });
        collected.push(...res.items);
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }
      if (collected.length >= cap) truncated = true;
      const cols = [
        "email",
        "status",
        "sentAt",
        "deliveredAt",
        "openedAt",
        "clickedAt",
        "bouncedAt",
        "unsubscribedAt",
        "complainedAt",
        "errorMessage",
      ];
      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const lines = [cols.join(",")];
      for (const r of collected) lines.push(cols.map((c) => escape(r[c])).join(","));
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaign.name.replace(/[^a-z0-9]+/gi, "_")}_recipients.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (truncated) showToast("info", "Export truncated to 5,000 rows");
      else showToast("success", `Exported ${collected.length} rows`);
    } catch (err: any) {
      showToast("error", err?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const t = analytics?.totals ?? {};
  const trend: { date: string; opens: number }[] = analytics?.dailyOpensTrend ?? [];
  const canEdit =
    campaign.status === "DRAFT" ||
    campaign.status === "SCHEDULED" ||
    campaign.status === "PAUSED";
  const canDelete = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white truncate">
              {campaign.name}
            </h1>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge(campaign.status)}`}>
              {campaign.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">{campaign.subject}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            From {campaign.fromName} &lt;{campaign.fromEmail}&gt;
            {campaign.sentAt
              ? ` · Sent ${format(new Date(campaign.sentAt), "MMM d, yyyy h:mm a")}`
              : campaign.scheduledAt
              ? ` · Scheduled ${format(new Date(campaign.scheduledAt), "MMM d, yyyy h:mm a")}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {campaign.status === "SENDING" && (
            <button
              onClick={onPause}
              disabled={isPending}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {campaign.status === "PAUSED" && (
            <button
              onClick={onResume}
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Resume
            </button>
          )}
          {canEdit && (
            <a
              href="/email-marketing/campaigns/new"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              title="Edit in wizard"
            >
              Edit
            </a>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              disabled={isPending}
              className="rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Sent" value={(t.sent ?? 0).toLocaleString()} />
        <Stat label="Delivered" value={(t.delivered ?? 0).toLocaleString()} />
        <Stat
          label="Opens"
          value={`${formatPct(analytics?.openRate)}`}
          sub={`${(t.opened ?? 0).toLocaleString()} total`}
        />
        <Stat
          label="Clicks"
          value={`${formatPct(analytics?.clickRate)}`}
          sub={`${(t.clicked ?? 0).toLocaleString()} total`}
        />
        <Stat
          label="Bounces"
          value={`${formatPct(analytics?.bounceRate)}`}
          sub={`${(t.bounced ?? 0).toLocaleString()} total`}
        />
        <Stat
          label="Unsubs"
          value={`${formatPct(analytics?.unsubRate)}`}
          sub={`${(t.unsubscribed ?? 0).toLocaleString()} total`}
        />
      </div>

      {/* Trend */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Daily opens (last 14 days)
        </h3>
        <div className="h-64">
          {trend.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
              No open data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="opens" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recipients */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recipients</h3>
          <div className="flex items-center gap-2">
            <select
              value={recipientStatus}
              onChange={(e) => {
                setRecipientStatus(e.target.value);
                setRecipientCursor(null);
              }}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200"
            >
              {RECIPIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s || "All statuses"}
                </option>
              ))}
            </select>
            <button
              onClick={onExport}
              disabled={exporting}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Sent</Th>
              <Th>Opened</Th>
              <Th>Clicked</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {recipients.length === 0 && !loadingMore ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  No recipients to show.
                </td>
              </tr>
            ) : (
              recipients.map((r) => (
                <tr key={r.id}>
                  <td className="px-6 py-2 text-sm text-gray-900 dark:text-gray-100">{r.email}</td>
                  <td className="px-6 py-2 text-xs text-gray-600 dark:text-gray-400">{r.status}</td>
                  <td className="px-6 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {r.sentAt ? format(new Date(r.sentAt), "MMM d HH:mm") : "—"}
                  </td>
                  <td className="px-6 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {r.openedAt ? format(new Date(r.openedAt), "MMM d HH:mm") : "—"}
                  </td>
                  <td className="px-6 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {r.clickedAt ? format(new Date(r.clickedAt), "MMM d HH:mm") : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {recipientCursor && (
          <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
            <button
              onClick={() => loadRecipients(false, recipientStatus)}
              disabled={loadingMore}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
      {children}
    </th>
  );
}
