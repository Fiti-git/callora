type CampaignRow = {
  id: string;
  name: string;
  status: string;
  totalCalls: number;
  qualifiedLeads: number;
  totalLeads: number;
  conversionRate: number;
  avgDuration: number;
  totalCost: number;
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-green-50 text-green-700",
  RUNNING: "bg-blue-50 text-blue-700",
  DRAFT: "bg-gray-100 text-gray-600",
  FAILED: "bg-red-50 text-red-700",
};

export function CampaignTable({ campaigns }: { campaigns: CampaignRow[] }) {
  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        No campaigns yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead>
          <tr className="bg-gray-50">
            {["Campaign", "Status", "Calls", "Qualified", "Conversion", "Avg Duration", "Total Cost"].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {campaigns.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[160px] truncate">
                {c.name}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    STATUS_STYLES[c.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {c.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{c.totalCalls}</td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {c.qualifiedLeads} / {c.totalLeads}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{c.conversionRate}%</td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {formatDuration(c.avgDuration)}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                ${c.totalCost.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
