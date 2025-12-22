import { fetchWithAuth } from "@/lib/api";

export default async function DashboardPage() {
  let stats;
  try {
    stats = await fetchWithAuth("/stats");
  } catch (error) {
    console.error("Dashboard Fetch Error:", error);
    return <div>Error loading dashboard data. Please try again later.</div>;
  }

  // If unauthorized or other error that fetchWithAuth didn't throw
  if (!stats) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Campaigns" value={stats.campaignCount || 0} />
        <StatCard title="Total Leads" value={stats.leadCount || 0} />
        <StatCard title="Calls Made" value={stats.callCount || 0} />
        <StatCard
          title="Qualified Leads"
          value={stats.qualifiedCount || 0}
          color="text-green-600"
        />
      </div>

      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
        <p className="mt-2 text-sm text-gray-500">
          No recent activity to display.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  color = "text-gray-900",
}: {
  title: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="text-sm font-medium text-gray-500">{title}</div>
      <div className={`mt-2 text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
