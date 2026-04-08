import { fetchWithAuth } from "@/lib/api";
import { BlacklistManager } from "@/components/blacklist-manager";

export default async function BlacklistPage() {
  let entries: any[] = [];
  try {
    entries = await fetchWithAuth("/blacklist");
  } catch {
    entries = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Blacklist</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Numbers on this list will never be dialled by any campaign.
        </p>
      </div>
      <BlacklistManager initial={entries} />
    </div>
  );
}
