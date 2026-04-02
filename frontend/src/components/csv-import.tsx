"use client";

import { useRef, useState } from "react";
import { importLeads } from "@/app/actions/campaign";
import { useRouter } from "next/navigation";

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
        const text = ev.target?.result as string;
        const leads = parseCSV(text);
        if (leads.length === 0) throw new Error("No valid rows found (Number column is required).");
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
      setSuccess(`${result.count} lead(s) imported successfully.`);
      setPreview([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onReset() {
    setPreview([]);
    setError(null);
    setSuccess(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
      >
        Upload CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Import Leads from CSV</h2>
              <button onClick={() => { setOpen(false); onReset(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Expected format hint */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">Expected CSV columns:</p>
                <code className="text-xs text-blue-600">{EXPECTED_COLUMNS.join(", ")}</code>
                <p className="text-xs text-blue-500 mt-1"><strong>Name</strong> and <strong>Number</strong> are required. Others are optional.</p>
              </div>

              {/* File input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select CSV file</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
                  {success}
                </div>
              )}

              {/* Preview table */}
              {preview.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{preview.length} leads ready to import:</p>
                  <div className="overflow-auto max-h-56 rounded-lg border">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Number</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Company</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Designation</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Discussion Area</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800">{row.name}</td>
                            <td className="px-3 py-2 text-gray-600">{row.number}</td>
                            <td className="px-3 py-2 text-gray-600">{row.company || "-"}</td>
                            <td className="px-3 py-2 text-gray-600">{row.designation || "-"}</td>
                            <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate">{row.discussionArea || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => { setOpen(false); onReset(); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={onImport}
                disabled={preview.length === 0 || loading}
                className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Importing..." : `Import ${preview.length > 0 ? preview.length : ""} Leads`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
