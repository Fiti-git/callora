"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { importLeads } from "@/app/actions/campaign";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const PHONE_COLUMN_VARIANTS = [
  "phone",
  "number",
  "mobile",
  "tel",
  "phone number",
  "mobile number",
];
const NAME_COLUMN_VARIANTS = [
  "name",
  "business name",
  "company",
  "company name",
  "business",
];

interface ParsedLead {
  phone: string;
  name: string;
}

function normalizePhone(raw: string): string {
  let digits = raw.toString().replace(/[^\d+]/g, "");
  if (digits.startsWith("+1")) digits = digits.slice(2);
  else if (digits.startsWith("1") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

export function CsvImport({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ParsedLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function parseCSV(text: string): ParsedLead[] {
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase(),
    });

    const headers = result.meta.fields ?? [];
    const hasPhoneColumn = headers.some((h) => PHONE_COLUMN_VARIANTS.includes(h));
    const hasNameColumn = headers.some((h) => NAME_COLUMN_VARIANTS.includes(h));
    if (!hasPhoneColumn) {
      throw new Error(
        `Missing phone column. Expected one of: ${PHONE_COLUMN_VARIANTS.join(", ")}.`
      );
    }
    if (!hasNameColumn) {
      throw new Error(
        `Missing name column. Expected one of: ${NAME_COLUMN_VARIANTS.join(", ")}.`
      );
    }

    return (result.data as Record<string, string>[])
      .map((row) => {
        const rawPhone =
          row.phone ??
          row.number ??
          row.mobile ??
          row.tel ??
          row["phone number"] ??
          row["mobile number"] ??
          "";
        const rawName =
          row.name ??
          row["business name"] ??
          row.company ??
          row["company name"] ??
          row.business ??
          "";
        return {
          phone: normalizePhone(rawPhone),
          name: (rawName || "").trim(),
        };
      })
      .filter((lead) => lead.phone.length >= 7 && lead.name.length > 0);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setPreview([]);
    setSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const leads = parseCSV(ev.target?.result as string);
        if (leads.length === 0) throw new Error("No valid rows found. Each row needs a name and a phone of at least 7 digits.");
        setPreview(leads);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV");
      }
    };
    reader.readAsText(file);
  }

  async function onImport() {
    if (preview.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await importLeads(campaignId, preview);
      if (result?.error) throw new Error(result.error);
      setSuccess(`${result.count} lead(s) imported.`);
      toast.success(`${result.count} leads imported.`);
      setPreview([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function onClose() {
    setOpen(false);
    setPreview([]);
    setError(null);
    setSuccess(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Upload CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 w-full max-w-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Import Leads from CSV</h2>
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Format hint */}
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Expected columns</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <strong className="text-gray-700 dark:text-gray-200">Name</strong> column: any of{" "}
                  <code>{NAME_COLUMN_VARIANTS.join(", ")}</code>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <strong className="text-gray-700 dark:text-gray-200">Phone</strong> column: any of{" "}
                  <code>{PHONE_COLUMN_VARIANTS.join(", ")}</code>
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Phone numbers are normalized automatically (e.g. <code>+1 (416) 555-0100</code> and <code>4165550100</code> are treated as the same).
                </p>
              </div>

              {/* File input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Select file
                </label>
                <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={onFileChange}
                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 dark:file:border-gray-600 file:text-xs file:font-medium file:bg-white dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-50 dark:hover:file:bg-gray-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                  {success}
                </div>
              )}

              {/* Preview */}
              {preview.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {preview.length} leads ready to import
                  </p>
                  <div className="overflow-auto max-h-52 rounded-lg border border-gray-200 dark:border-gray-800">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Phone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {preview.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                            <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{row.name}</td>
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono">{row.phone}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onImport}
                disabled={preview.length === 0 || loading}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Importing...
                  </>
                ) : (
                  `Import ${preview.length > 0 ? preview.length : ""} Leads`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
