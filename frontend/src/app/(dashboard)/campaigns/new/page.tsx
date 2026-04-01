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
        toast.success(`Campaign created with ${result.count || 0} leads!`);
      } else {
        toast.success("Campaign created!");
      }

      setTimeout(() => router.push(`/campaigns/${campaign.id}`), 800);
    } catch (error: any) {
      toast.error("Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 1 — pick type
  if (!type) {
    return (
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">New Campaign</h2>
        <p className="text-gray-500 mb-8">How do you want to find your leads?</p>

        <div className="grid grid-cols-2 gap-6">
          {/* AI Leads */}
          <button
            onClick={() => setType("AI")}
            className="group text-left bg-white border-2 border-gray-200 hover:border-indigo-500 rounded-xl p-6 shadow-sm hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 mb-2">
              AI Leads
            </h3>
            <p className="text-sm text-gray-500">
              Describe your target and AI will find businesses from Google Maps, filter them, and call them automatically.
            </p>
            <div className="mt-4 text-xs text-indigo-600 font-medium">
              Powered by Gemini + Google Maps →
            </div>
          </button>

          {/* CSV Upload */}
          <button
            onClick={() => setType("CSV")}
            className="group text-left bg-white border-2 border-gray-200 hover:border-green-500 rounded-xl p-6 shadow-sm hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-3">📋</div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-green-600 mb-2">
              CSV Import
            </h3>
            <p className="text-sm text-gray-500">
              Upload your own contact list from a CSV file. Supports Name, Number, Company, Designation, and Discussion Area.
            </p>
            <div className="mt-4 text-xs text-green-600 font-medium">
              Your own leads list →
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Step 2 — fill details
  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow">
      {/* Header with back */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => { setType(null); setName(""); setPrompt(""); setCsvLeads([]); }}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ← Back
        </button>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
          type === "AI" ? "bg-indigo-100 text-indigo-700" : "bg-green-100 text-green-700"
        }`}>
          {type === "AI" ? "🤖 AI Leads" : "📋 CSV Import"}
        </span>
        <h2 className="text-xl font-bold text-gray-900">
          {type === "AI" ? "Create AI Campaign" : "Create CSV Campaign"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campaign name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Campaign Name
          </label>
          <input
            type="text"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            placeholder={type === "AI" ? "e.g. Q1 Outreach - NY Spice Shops" : "e.g. Imported Contacts - April"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* AI: targeting prompt */}
        {type === "AI" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Targeting Prompt
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Describe the businesses you want to find and contact.
            </p>
            <textarea
              required
              rows={4}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
              placeholder="e.g. Find spice importers in New York with fewer than 100 reviews."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
        )}

        {/* CSV: file upload */}
        {type === "CSV" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upload CSV File
            </label>
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-3">
                Required columns: <strong>Name, Number</strong> &nbsp;|&nbsp; Optional: Company, Designation, DiscussionArea
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onFileChange}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
              />
            </div>

            {csvError && (
              <p className="mt-2 text-sm text-red-600">{csvError}</p>
            )}

            {csvLeads.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-green-700 font-medium mb-2">
                  ✓ {csvLeads.length} leads ready to import
                </p>
                <div className="overflow-auto max-h-40 rounded-lg border text-xs">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500">Name</th>
                        <th className="px-3 py-2 text-left text-gray-500">Number</th>
                        <th className="px-3 py-2 text-left text-gray-500">Company</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {csvLeads.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-gray-700">{r.name}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.number}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.company || "-"}</td>
                        </tr>
                      ))}
                      {csvLeads.length > 5 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-1.5 text-gray-400 italic">
                            +{csvLeads.length - 5} more rows...
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

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/campaigns")}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || (type === "CSV" && csvLeads.length === 0)}
            className={`px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors ${
              type === "AI"
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {loading
              ? "Creating..."
              : type === "CSV"
              ? `Create Campaign & Import ${csvLeads.length} Leads`
              : "Create Campaign"}
          </button>
        </div>
      </form>
    </div>
  );
}
