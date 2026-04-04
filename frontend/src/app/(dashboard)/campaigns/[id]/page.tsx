import { fetchWithAuth } from "@/lib/api";
import { CampaignControls } from "@/components/campaign-controls";
import { LeadCallDetails } from "@/components/lead-call-details";
import { CsvImport } from "@/components/csv-import";
import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-green-50 text-green-700 ring-1 ring-green-200",
  RUNNING: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  CALLING: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  SCRAPING: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  FAILED: "bg-red-50 text-red-700 ring-1 ring-red-200",
  DRAFT: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  READY: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

const LEAD_STATUS_STYLES: Record<string, string> = {
  QUALIFIED: "bg-green-50 text-green-700 ring-1 ring-green-200",
  CALLED: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  DISQUALIFIED: "bg-red-50 text-red-700 ring-1 ring-red-200",
  NEW: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  PENDING_RETRY: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  PENDING_FOLLOWUP: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let campaign;
  try {
    campaign = await fetchWithAuth(`/campaigns/${id}`);
  } catch (error) {
    console.error("Fetch Error:", error);
    notFound();
  }

  if (!campaign) notFound();

  let pendingFollowUps = { total: 0 };
  try {
    pendingFollowUps = await fetchWithAuth(`/campaigns/${id}/followups/pending`);
  } catch {
    // non-fatal
  }

  const isCSV = campaign.type === "CSV";

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/campaigns" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Campaigns
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${
              isCSV
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-violet-50 text-violet-700 ring-violet-200"
            }`}>
              {isCSV ? "CSV Import" : "AI Leads"}
            </span>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
              STATUS_STYLES[campaign.status] || STATUS_STYLES.DRAFT
            }`}>
              {campaign.status}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isCSV && <CsvImport campaignId={campaign.id} />}
            <CampaignControls
              campaignId={campaign.id}
              status={campaign.status}
              leadsCount={campaign.leads?.length || 0}
              campaignType={campaign.type || "AI"}
              pendingFollowUps={pendingFollowUps.total}
            />
          </div>
        </div>

        <p className="text-sm text-gray-400 mt-1">
          Created {campaign.createdAt ? format(new Date(campaign.createdAt), "PPP") : "-"}
        </p>
      </div>

      {/* Info box */}
      {isCSV ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-700 mb-1">CSV Import Campaign</p>
          <p className="text-sm text-gray-500">
            Leads are manually uploaded via CSV. Use the <strong className="text-gray-700">Upload CSV</strong> button to add contacts, then click <strong className="text-gray-700">Start Calls</strong> when ready.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Targeting Prompt</p>
          <p className="text-sm text-gray-700 leading-relaxed">
            {campaign.prompt || <span className="text-gray-400 italic">No prompt specified.</span>}
          </p>
        </div>
      )}

      {/* Leads table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Leads <span className="text-gray-400 font-normal">({campaign.leads?.length || 0})</span>
          </h2>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {isCSV ? "Notes" : "Summary"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!campaign.leads || campaign.leads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-500">No leads yet</p>
                      <p className="text-xs text-gray-400">
                        {isCSV ? "Upload a CSV file to add contacts." : "Click Find Leads to discover prospects."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                campaign.leads.map((lead: any) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{lead.businessName}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{lead.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        LEAD_STATUS_STYLES[lead.status] || LEAD_STATUS_STYLES.NEW
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                      {lead.interestScore > 0 ? `${lead.interestScore}/10` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {isCSV
                        ? lead.notes || <span className="text-gray-300">—</span>
                        : lead.calls?.[0]?.summary || <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LeadCallDetails leads={campaign.leads || []} />
    </div>
  );
}
