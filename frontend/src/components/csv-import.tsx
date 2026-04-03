"use client";

import { useRef, useState } from "react";
import { importLeads } from "@/app/actions/campaign";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const REQUIRED_COLUMNS = ["Name", "Number"];
const EXPECTED_COLUMNS = ["ContactID", "Name", "Number", "Company", "Designation", "DiscussionArea"];

interface ParsedLead {
  contactId?: string;
  name: string;
  number: string;
  company?: string;
  designation?: string;
  discussionArea?: string;
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
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");
    const headers = lines[0].split(",").map((h) => h.trim());
    for (const col of REQUIRED_COLUMNS) {
      if (!headers.includes(col)) throw new Error(`Missing required column: "${col}"`);
    }
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ""; });
      return {
        contactId: row["ContactID"],
        name: row["Name"],
        number: row["Number"],
        company: row["Company"],
        designation: row["Designation"],
        discussionArea: row["DiscussionArea"],
      };
    }).filter((r) => r.number);
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
        if (leads.length === 0) throw new Error("No valid rows found (Number column required).");
        setPreview(leads);
      } catch (err: any) {
        setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Upload CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Import Leads from CSV</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Format hint */}
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-600 mb-1">Expected columns</p>
                <code className="text-xs text-gray-500">{EXPECTED_COLUMNS.join(", ")}</code>
                <p className="text-xs text-gray-400 mt-1">
                  <strong className="text-gray-500">Name</strong> and <strong className="text-gray-500">Number</strong> are required. All others are optional.
                </p>
              </div>

              {/* File input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Select file
                </label>
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={onFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-xs file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                  {success}
                </div>
              )}

              {/* Preview */}
              {preview.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {preview.length} leads ready to import
                  </p>
                  <div className="overflow-auto max-h-52 rounded-lg border border-gray-200">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Number</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Company</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Designation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800">{row.name}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono">{row.number}</td>
                            <td className="px-3 py-2 text-gray-500">{row.company || "—"}</td>
                            <td className="px-3 py-2 text-gray-500">{row.designation || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
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
