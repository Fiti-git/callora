import { fetchWithAuth } from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { FollowUpActions } from "@/components/follow-up-actions";
import { ScheduleFollowUpTrigger } from "@/components/schedule-followup-trigger";

const STATUS_STYLES: Record<string, string> = {
  PENDING_RETRY: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  PENDING_FOLLOWUP: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_RETRY: "Retry",
  PENDING_FOLLOWUP: "Follow-Up",
};

export default async function FollowUpsPage() {
  let leads: any[] = [];
  let allLeads: any[] = [];
  try {
    [leads, allLeads] = await Promise.all([
      fetchWithAuth("/leads?status=PENDING_RETRY,PENDING_FOLLOWUP"),
      fetchWithAuth("/leads"),
    ]);
  } catch (error) {
    console.error("Fetch Error:", error);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load follow-ups. Please refresh the page.
      </div>
    );
  }

  // Group leads by campaign
  const byCampaign = leads.reduce(
    (acc: Record<string, { campaign: any; leads: any[] }>, lead: any) => {
      const cId = lead.campaignId;
      if (!acc[cId]) acc[cId] = { campaign: lead.campaign, leads: [] };
      acc[cId].leads.push(lead);
      return acc;
    },
    {}
  );

  const now = new Date();

  const dueLeads = leads.filter((lead: any) => {
    if (lead.status === "PENDING_RETRY" && lead.nextCallAt) return new Date(lead.nextCallAt) <= now;
    if (lead.status === "PENDING_FOLLOWUP" && lead.followUpAt) return new Date(lead.followUpAt) <= now;
    return false;
  });

  const retryCount = leads.filter((l: any) => l.status === "PENDING_RETRY").length;
  const callbackCount = leads.filter((l: any) => l.status === "PENDING_FOLLOWUP").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Follow-Ups</h1>
          <p className="mt-1 text-sm text-gray-500">
            {leads.length > 0
              ? `${leads.length} lead${leads.length !== 1 ? "s" : ""} scheduled — ${dueLeads.length} due now.`
              : "No follow-ups scheduled yet."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {leads.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {retryCount} Retries
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                {callbackCount} Callbacks
              </span>
            </>
          )}
          <ScheduleFollowUpTrigger leads={allLeads} />
          <Link
            href="/follow-ups/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </Link>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">No follow-ups scheduled</p>
            <p className="text-xs text-gray-400 max-w-xs">
              Follow-ups are created automatically when leads don&apos;t answer or show strong interest.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.values(byCampaign).map(({ campaign, leads: campaignLeads }) => {
            const dueCampaignLeads = campaignLeads.filter((lead: any) => {
              if (lead.status === "PENDING_RETRY" && lead.nextCallAt) return new Date(lead.nextCallAt) <= now;
              if (lead.status === "PENDING_FOLLOWUP" && lead.followUpAt) return new Date(lead.followUpAt) <= now;
              return false;
            });
            const pendingCount = dueCampaignLeads.length;

            return (
              <div key={campaign?.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Campaign header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/campaigns/${campaign?.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                    >
                      {campaign?.name || "Unknown Campaign"}
                    </Link>
                    <span className="text-xs text-gray-400">
                      {campaignLeads.length} lead{campaignLeads.length !== 1 ? "s" : ""}
                    </span>
                    {pendingCount > 0 && (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600 ring-1 ring-red-200">
                        {pendingCount} due now
                      </span>
                    )}
                  </div>
                  {pendingCount > 0 && campaign?.id && (
                    <FollowUpActions campaignId={campaign.id} pendingCount={pendingCount} />
                  )}
                </div>

                {/* Leads table */}
                <table className="min-w-full divide-y divide-gray-100">
                  <thead>
                    <tr className="bg-white">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Score</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Attempts</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Scheduled For</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {campaignLeads.map((lead: any) => {
                      const scheduledAt =
                        lead.status === "PENDING_RETRY" ? lead.nextCallAt : lead.followUpAt;
                      const isDue = scheduledAt ? new Date(scheduledAt) <= now : false;

                      return (
                        <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{lead.businessName}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{lead.phone}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[lead.status] || ""}`}>
                              {STATUS_LABELS[lead.status] || lead.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-700">
                            {lead.interestScore > 0
                              ? `${lead.interestScore}/10`
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {lead.callAttempts ?? 0}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {scheduledAt ? (
                              <div>
                                <span className={isDue ? "text-red-600 font-medium" : "text-gray-500"}>
                                  {isDue
                                    ? "Due now"
                                    : `In ${formatDistanceToNow(new Date(scheduledAt))}`}
                                </span>
                                <div className="text-xs text-gray-400 mt-0.5">
                                  {format(new Date(scheduledAt), "MMM d, h:mm a")}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                            {lead.calls?.[0]?.summary || <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
