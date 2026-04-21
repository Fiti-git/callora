"use client";

import { useState } from "react";
import { syncVapiHistory } from "@/app/actions/vapi-sync";
import toast from "react-hot-toast";

export default function VapiSyncCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    total: number;
    errors: string[];
  } | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    try {
      const data = await syncVapiHistory();
      setResult(data);
      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} call${data.imported !== 1 ? "s" : ""} from Vapi.`);
      } else {
        toast.success("Sync complete — no new calls to import.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
      <div className="px-6 py-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Vapi Call History</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Import past calls made directly in Vapi into Callora. Leads are
          matched by phone number; unmatched calls are placed in a "Vapi Import"
          campaign. Safe to run multiple times — duplicates are skipped.
        </p>
      </div>
      <div className="px-6 py-5 flex items-start gap-4">
        <button
          onClick={handleSync}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-gray-100 px-5 py-2.5 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-60 transition-colors shrink-0"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Syncing...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync from Vapi
            </>
          )}
        </button>

        {result && (
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <p>
              <span className="font-medium text-green-700 dark:text-green-400">{result.imported} imported</span>
              {" · "}
              <span className="text-gray-400 dark:text-gray-500">{result.skipped} skipped</span>
              {" · "}
              <span className="text-gray-400 dark:text-gray-500">{result.total} total from Vapi</span>
            </p>
            {result.errors.length > 0 && (
              <p className="text-red-500 dark:text-red-400 text-xs">{result.errors.length} error(s): {result.errors[0]}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
