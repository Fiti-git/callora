"use client";

import { createCampaign, importLeads } from "@/app/actions/campaign";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import toast from "react-hot-toast";

type CampaignType = "AI" | "CSV";

interface ParsedLead {
  name: string;
  number: string;
  company?: string;
  designation?: string;
  discussionArea?: string;
}

function parseCSV(text: string): ParsedLead[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");
  const headers = lines[0].split(",").map((h) => h.trim());
  if (!headers.includes("Name") || !headers.includes("Number"))
    throw new Error('Missing required columns: "Name" and "Number"');

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return {
      name: row["Name"],
      number: row["Number"],
      company: row["Company"],
      designation: row["Designation"],
      discussionArea: row["DiscussionArea"],
    };
  }).filter((r) => r.number);
}

export default function NewCampaignPage() {
  const [type, setType] = useState<CampaignType | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [csvLeads, setCsvLeads] = useState<ParsedLead[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCsvError(null);
    setCsvLeads([]);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const leads = parseCSV(ev.target?.result as string);
        if (leads.length === 0) throw new Error("No valid rows found.");
        setCsvLeads(leads);
      } catch (err: any) {
        setCsvError(err.message);
      }
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    if (type === "CSV" && csvLeads.length === 0) {
      toast.error("Please upload a valid CSV file.");
      return;
    }
    setLoading(true);
    try {
      const campaign = await createCampaign(name, type, type === "AI" ? prompt : undefined);
      if (!campaign?.id) throw new Error("Campaign creation failed: " + JSON.stringify(campaign));

      if (type === "CSV") {
        const result = await importLeads(campaign.id, csvLeads);
        toast.success(`Campaign created with ${result.count || 0} leads.`);
      } else {
        toast.success("Campaign created.");
      }

      setTimeout(() => router.push(`/campaigns/${campaign.id}`), 800);
    } catch (error: any) {
      toast.error("Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 1: pick type
  if (!type) {
    return (
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">New Campaign</h1>
          <p className="mt-1 text-sm text-gray-500">Select how you want to source your leads.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setType("AI")}
            className="group text-left bg-white border border-gray-200 hover:border-blue-400 rounded-xl p-6 transition-all hover:shadow-sm"
          >
            <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 mb-1.5">
              AI Leads
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Describe your target market and AI will find businesses from Google Maps, filter them, and prepare them for calls.
            </p>
            <p className="mt-3 text-xs text-violet-600 font-medium">Gemini + Google Maps</p>
          </button>

          <button
            onClick={() => setType("CSV")}
            className="group text-left bg-white border border-gray-200 hover:border-blue-400 rounded-xl p-6 transition-all hover:shadow-sm"
          >
            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 mb-1.5">
              CSV Import
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Upload your own contact list. Supports Name, Number, Company, Designation, and Discussion Area columns.
            </p>
            <p className="mt-3 text-xs text-emerald-600 font-medium">Your own list</p>
          </button>
        </div>
      </div>
    );
  }

  // Step 2: fill details
  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => { setType(null); setName(""); setPrompt(""); setCsvLeads([]); }}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">
              {type === "AI" ? "AI Campaign" : "CSV Campaign"}
            </h1>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${
              type === "AI"
                ? "bg-violet-50 text-violet-700 ring-violet-200"
                : "bg-emerald-50 text-emerald-700 ring-emerald-200"
            }`}>
              {type === "AI" ? "AI Leads" : "CSV Import"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Fill in the details below to create your campaign.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Campaign name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Campaign name
            </label>
            <input
              type="text"
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={type === "AI" ? "e.g. Q1 Outreach — New York Restaurants" : "e.g. Imported Contacts — April 2026"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* AI: targeting prompt */}
          {type === "AI" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Targeting prompt
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Describe the businesses you want to find and contact.
              </p>
              <textarea
                required
                rows={4}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                placeholder="e.g. Find spice importers in New York with fewer than 100 reviews."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          )}

          {/* CSV: file upload */}
          {type === "CSV" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                CSV file
              </label>
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                <p className="text-xs text-gray-400 mb-3">
                  Required columns: <span className="font-medium text-gray-600">Name, Number</span>
                  <span className="mx-1.5 text-gray-300">|</span>
                  Optional: Company, Designation, DiscussionArea
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-xs file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
                />
              </div>

              {csvError && (
                <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {csvError}
                </div>
              )}

              {csvLeads.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    {csvLeads.length} leads ready to import
                  </p>
                  <div className="overflow-auto max-h-40 rounded-lg border border-gray-200 text-xs">
                    <table className="min-w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold">Name</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold">Number</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold">Company</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvLeads.slice(0, 5).map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-700">{r.name}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.number}</td>
                            <td className="px-3 py-1.5 text-gray-400">{r.company || "—"}</td>
                          </tr>
                        ))}
                        {csvLeads.length > 5 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-1.5 text-gray-400 italic">
                              +{csvLeads.length - 5} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => router.push("/campaigns")}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (type === "CSV" && csvLeads.length === 0)}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </>
              ) : type === "CSV" ? (
                `Create Campaign${csvLeads.length > 0 ? ` & Import ${csvLeads.length} Leads` : ""}`
              ) : (
                "Create Campaign"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
