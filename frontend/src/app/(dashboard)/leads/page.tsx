import { fetchWithAuth } from "@/lib/api";
import { format } from "date-fns";

export default async function LeadsPage() {
  let leads: any[] = [];
  try {
    leads = await fetchWithAuth("/leads");
  } catch (error) {
    console.error("Fetch Error:", error);
    return <div>Error loading leads.</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">All Leads</h2>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Business
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Campaign
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Call Summary
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {!leads || leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  No leads found.
                </td>
              </tr>
            ) : (
              leads.map((lead: any) => (
                <tr key={lead.id}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {lead.businessName}
                    </div>
                    <div className="text-sm text-gray-500">{lead.phone}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {lead.campaign?.name || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        lead.status === "QUALIFIED"
                          ? "bg-green-100 text-green-800"
                          : lead.status === "DISQUALIFIED"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-bold">
                    {lead.interestScore > 0 ? lead.interestScore : "-"}
                  </td>
                  <td
                    className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate"
                    title={lead.calls?.[0]?.summary || ""}
                  >
                    {lead.calls?.[0]?.summary || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {lead.createdAt
                      ? format(new Date(lead.createdAt), "MMM d")
                      : "-"}
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
