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
        <h2 className="text-2xl font-bold text-gray-900">Blacklist</h2>
        <p className="text-sm text-gray-500 mt-1">
          Phone numbers on this list will never be called by any campaign.
        </p>
      </div>
      <BlacklistManager initial={entries} />
    </div>
  );
}
