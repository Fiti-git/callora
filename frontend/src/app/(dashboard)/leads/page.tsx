import { fetchWithAuth } from "@/lib/api";
import { format } from "date-fns";

const LEAD_STATUS_STYLES: Record<string, string> = {
  QUALIFIED: "bg-green-50 text-green-700 ring-1 ring-green-200",
  CALLED: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  DISQUALIFIED: "bg-red-50 text-red-700 ring-1 ring-red-200",
  NEW: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

export default async function LeadsPage() {
  let leads: any[] = [];
  try {
    leads = await fetchWithAuth("/leads");
  } catch (error) {
    console.error("Fetch Error:", error);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load leads. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">All Leads</h1>
        <p className="mt-1 text-sm text-gray-500">
          {leads.length > 0
            ? `${leads.length} lead${leads.length !== 1 ? "s" : ""} across all campaigns.`
            : "Leads from all campaigns will appear here."}
        </p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Campaign
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Call Summary
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!leads || leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-500">No leads yet</p>
                    <p className="text-xs text-gray-400">Start a campaign to generate leads.</p>
                  </div>
                </td>
              </tr>
            ) : (
              leads.map((lead: any) => (
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{lead.businessName}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{lead.phone}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {lead.campaign?.name || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      LEAD_STATUS_STYLES[lead.status] || LEAD_STATUS_STYLES.NEW
                    }`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-700">
                    {lead.interestScore > 0
                      ? `${lead.interestScore}/10`
                      : <span className="text-gray-300 font-normal">—</span>}
                  </td>
                  <td
                    className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate"
                    title={lead.calls?.[0]?.summary || ""}
                  >
                    {lead.calls?.[0]?.summary || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {lead.createdAt ? format(new Date(lead.createdAt), "MMM d, yyyy") : "—"}
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
