import { fetchWithAuth } from "@/lib/api";
import { RunCampaignButton } from "@/components/run-campaign-button";
import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let campaign;
  try {
    campaign = await fetchWithAuth(`/campaigns/${params.id}`);
  } catch (error) {
    console.error("Fetch Error:", error);
    notFound();
  }

  if (!campaign) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <Link
            href="/campaigns"
            className="text-sm text-gray-500 hover:underline"
          >
            ← Back to Campaigns
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            {campaign.name}
          </h1>
          <p className="text-gray-500 text-sm">
            Created:{" "}
            {campaign.createdAt
              ? format(new Date(campaign.createdAt), "PPP")
              : "-"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div
            className={`px-3 py-1 rounded-full text-sm font-semibold ${
              campaign.status === "COMPLETED"
                ? "bg-green-100 text-green-800"
                : campaign.status === "RUNNING"
                ? "bg-blue-100 text-blue-800"
                : campaign.status === "FAILED"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {campaign.status}
          </div>
          {campaign.status !== "RUNNING" && (
            <RunCampaignButton campaignId={campaign.id} />
          )}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-2">Targeting Prompt</h3>
        <p className="text-gray-600 bg-gray-50 p-3 rounded border">
          {campaign.prompt}
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900">
        Leads ({campaign.leads?.length || 0})
      </h2>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Business
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Summary
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {!campaign.leads || campaign.leads.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  No leads found yet. Run the campaign to find them.
                </td>
              </tr>
            ) : (
              campaign.leads.map((lead: any) => (
                <tr key={lead.id}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {lead.businessName}
                    </div>
                    <div className="text-sm text-gray-500">{lead.phone}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        lead.status === "QUALIFIED"
                          ? "bg-green-100 text-green-800"
                          : lead.status === "CALLED"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {lead.interestScore > 0 ? `${lead.interestScore}/10` : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {lead.calls?.[0]?.summary || "-"}
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
