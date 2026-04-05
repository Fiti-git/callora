import { fetchWithAuth } from "@/lib/api";
import Link from "next/link";
import { FollowUpSettingsForm } from "@/components/followup-settings-form";

export default async function FollowUpSettingsPage() {
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
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <Link href="/follow-ups" className="hover:text-gray-600 transition-colors">
            Follow-Ups
          </Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-600">Settings</span>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900">Follow-Up Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure retry and callback conditions for each campaign. Changes apply to future follow-ups only.
        </p>
      </div>

      {/* Defaults info box */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
        <div className="flex gap-3">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-800">System defaults</p>
            <p className="text-xs text-blue-600 mt-0.5">
              New campaigns start with: <strong>3 retries</strong>, <strong>24h retry delay</strong>, <strong>3-day follow-up delay</strong>.
              Override per campaign below.
            </p>
          </div>
        </div>
      </div>

      {/* Per-campaign forms */}
      {campaigns.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">No campaigns yet</p>
            <Link href="/campaigns/new" className="text-xs text-blue-600 hover:underline">
              Create your first campaign
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign: any) => (
            <FollowUpSettingsForm key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
