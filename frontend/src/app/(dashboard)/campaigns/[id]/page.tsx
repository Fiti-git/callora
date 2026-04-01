import { fetchWithAuth } from "@/lib/api";
import { CampaignControls } from "@/components/campaign-controls";
import { LeadCallDetails } from "@/components/lead-call-details";
import { CsvImport } from "@/components/csv-import";
import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";

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

  const isCSV = campaign.type === "CSV";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <Link href="/campaigns" className="text-sm text-gray-500 hover:underline">
            ← Back to Campaigns
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-3xl font-bold text-gray-900">{campaign.name}</h1>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              isCSV ? "bg-green-100 text-green-700" : "bg-indigo-100 text-indigo-700"
            }`}>
              {isCSV ? "📋 CSV" : "🤖 AI"}
            </span>
          </div>
          <p className="text-gray-500 text-sm">
            Created: {campaign.createdAt ? format(new Date(campaign.createdAt), "PPP") : "-"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
            campaign.status === "COMPLETED"
              ? "bg-green-100 text-green-800"
              : campaign.status === "RUNNING" || campaign.status === "CALLING" || campaign.status === "SCRAPING"
              ? "bg-blue-100 text-blue-800"
              : campaign.status === "FAILED"
              ? "bg-red-100 text-red-800"
              : "bg-gray-100 text-gray-800"
          }`}>
            {campaign.status}
          </div>

          {/* CSV campaigns: Upload CSV button in header */}
          {isCSV && <CsvImport campaignId={campaign.id} />}

          <CampaignControls
            campaignId={campaign.id}
            status={campaign.status}
            leadsCount={campaign.leads?.length || 0}
            campaignType={campaign.type || "AI"}
          />
        </div>
      </div>

      {/* AI: show targeting prompt | CSV: show info box */}
      {isCSV ? (
        <div className="bg-green-50 border border-green-100 rounded-lg p-5">
          <h3 className="font-semibold text-green-800 mb-1">📋 CSV Import Campaign</h3>
          <p className="text-sm text-green-700">
            Leads are manually uploaded via CSV. Use the <strong>Upload CSV</strong> button to add more leads, then hit <strong>Start Calls</strong> when ready.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Targeting Prompt</h3>
          <p className="text-gray-600 bg-gray-50 p-3 rounded border">
            {campaign.prompt || "-"}
          </p>
        </div>
      )}

      {/* Leads table */}
      <h2 className="text-xl font-bold text-gray-900">
        Leads ({campaign.leads?.length || 0})
      </h2>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {isCSV ? "Notes" : "Summary"}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {!campaign.leads || campaign.leads.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500">
                  {isCSV
                    ? "No leads yet. Upload a CSV file to get started."
                    : "No leads found yet. Click Find Leads to start."}
                </td>
              </tr>
            ) : (
              campaign.leads.map((lead: any) => (
                <tr key={lead.id}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{lead.businessName}</div>
                    <div className="text-sm text-gray-500">{lead.phone}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      lead.status === "QUALIFIED"
                        ? "bg-green-100 text-green-800"
                        : lead.status === "CALLED"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {lead.interestScore > 0 ? `${lead.interestScore}/10` : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {isCSV
                      ? lead.notes || "-"
                      : lead.calls?.[0]?.summary || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <LeadCallDetails leads={campaign.leads || []} />
    </div>
  );
}
