import { fetchWithAuth } from "@/lib/api";
import DataPageClient from "./data-page-client";

/**
 * /settings/data — GDPR controls for the tenant.
 *
 * Server component fetches the org name (used by the typed-confirmation
 * modal) and hands off to the client component for the destructive flow.
 */
export default async function DataPage() {
  let orgName = "";
  try {
    // /api/settings returns org-scoped settings including the org row.
    const settings = await fetchWithAuth("/settings");
    orgName = settings?.organization?.name ?? settings?.name ?? "";
  } catch {
    // If /settings fails, the page still renders — user just won't see the
    // pre-filled org name. The typed-confirmation modal will rely on the
    // user knowing the name, which is a reasonable fallback.
    orgName = "";
  }

  return (
    <div className="mt-3 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
          Your data
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Export or permanently delete the data Callora holds for your
          organisation. These actions affect your entire organisation, not
          just your user account.
        </p>
      </div>

      <DataPageClient orgName={orgName} />
    </div>
  );
}
