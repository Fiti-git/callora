import Link from "next/link";
import { format } from "date-fns";
import { fetchWithAuth } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-green-50 text-green-700 ring-1 ring-green-200",
  RUNNING: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  CALLING: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  SCRAPING: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  FAILED: "bg-red-50 text-red-700 ring-1 ring-red-200",
  DRAFT: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  READY: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

export default async function CampaignsPage() {
  let campaigns: any[] = [];
  try {
    campaigns = await fetchWithAuth("/campaigns");
  } catch (error) {
    console.error("Fetch Error:", error);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load campaigns. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your outreach campaigns.</p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Campaign
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Campaign
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Leads
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!campaigns || campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-500">No campaigns yet</p>
                    <p className="text-xs text-gray-400">Create your first campaign to get started.</p>
                  </div>
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">{campaign.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${
                      campaign.type === "CSV"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-violet-50 text-violet-700 ring-violet-200"
                    }`}>
                      {campaign.type === "CSV" ? "CSV Import" : "AI Leads"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[campaign.status] || STATUS_STYLES.DRAFT
                    }`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {campaign._count?.leads || 0}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {format(new Date(campaign.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
