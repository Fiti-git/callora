import { fetchWithAuth } from "@/lib/api";
import { CallVolumeChart } from "./CallVolumeChart";
import { OutcomeDonut } from "./OutcomeDonut";
import { CostTrendChart } from "./CostTrendChart";
import { CostBreakdownChart } from "./CostBreakdownChart";
import { FunnelDisplay } from "./FunnelDisplay";
import { CampaignTable } from "./CampaignTable";

export default async function AnalyticsPage() {
  let data: any;
  try {
    data = await fetchWithAuth("/analytics");
  } catch (error) {
    console.error("Analytics Fetch Error:", error);
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        Failed to load analytics data. Please refresh the page.
      </div>
    );
  }

  if (!data) return null;

  const { callVolume, outcomeDistribution, funnel, campaigns, costs } = data;

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Call performance and cost breakdown across all campaigns.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CostCard title="Total Spend" value={`$${(costs.totalAllTime ?? 0).toFixed(4)}`} icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        } />
        <CostCard title="This Month" value={`$${(costs.totalThisMonth ?? 0).toFixed(4)}`} icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        } />
        <CostCard title="Cost / Qualified Lead" value={`$${(costs.perQualifiedLead ?? 0).toFixed(4)}`} accent icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        } />
        <CostCard title="Avg Call Duration" value={formatDuration(costs.avgDurationAllTime ?? 0)} icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        } />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Call Volume (Last 30 Days)</h2>
          <CallVolumeChart data={callVolume} />
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Call Outcomes</h2>
          <OutcomeDonut data={outcomeDistribution} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Lead Conversion Funnel</h2>
          <FunnelDisplay funnel={funnel} />
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Cost Breakdown by Type</h2>
          <CostBreakdownChart breakdown={costs.breakdown} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Cost Trend (Last 30 Days)</h2>
        <CostTrendChart data={costs.trend} />
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Campaign Performance</h2>
        <CampaignTable campaigns={campaigns} />
      </div>
    </div>
  );
}

function CostCard({ title, value, icon, accent = false }: { title: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`bg-white dark:bg-gray-900 border rounded-xl p-5 ${accent ? "border-blue-200 dark:border-blue-500/30" : "border-gray-200 dark:border-gray-800"}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"}`}>
          {icon}
        </div>
      </div>
      <div className={`text-2xl font-bold ${accent ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}>{value}</div>
    </div>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
