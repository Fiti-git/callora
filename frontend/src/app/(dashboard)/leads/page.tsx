import { fetchWithAuth } from "@/lib/api";
import { LeadsBulkList } from "@/components/leads-bulk-list";

export default async function LeadsPage() {
  let leads: any[] = [];
  try {
    leads = await fetchWithAuth("/leads");
  } catch (error) {
    console.error("Fetch Error:", error);
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Failed to load leads. Please refresh the page.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">All Leads</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {leads.length > 0
            ? `${leads.length} lead${leads.length !== 1 ? "s" : ""} across all campaigns.`
            : "Leads from all campaigns will appear here."}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {leads.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No leads yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-600">Start a campaign to generate leads.</p>
          </div>
        ) : (
          <LeadsBulkList leads={leads} />
        )}
      </div>
    </div>
  );
}
