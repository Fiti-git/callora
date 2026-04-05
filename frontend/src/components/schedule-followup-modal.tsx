"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { scheduleFollowUp } from "@/app/actions/campaign";

interface Lead {
  id: string;
  businessName: string;
  phone: string | null;
  status: string;
  campaign?: { name: string };
}

interface ScheduleFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[]; // all leads passed from the server page
}

// Default the datetime input to now + 1 day, formatted for <input type="datetime-local">
function defaultDatetime(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // datetime-local needs "YYYY-MM-DDTHH:MM"
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleFollowUpModal({ isOpen, onClose, leads }: ScheduleFollowUpModalProps) {
  const [leadId, setLeadId] = useState("");
  const [type, setType] = useState<"PENDING_RETRY" | "PENDING_FOLLOWUP">("PENDING_RETRY");
  const [scheduledAt, setScheduledAt] = useState(defaultDatetime());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setLeadId("");
      setSearch("");
      setType("PENDING_RETRY");
      setScheduledAt(defaultDatetime());
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredLeads = leads.filter((l) => {
    const q = search.toLowerCase();
    return (
      l.businessName.toLowerCase().includes(q) ||
      (l.phone || "").includes(q) ||
      (l.campaign?.name || "").toLowerCase().includes(q)
    );
  });

  const selectedLead = leads.find((l) => l.id === leadId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId) {
      toast.error("Please select a lead.");
      return;
    }
    setSaving(true);
    try {
      await scheduleFollowUp(leadId, type, new Date(scheduledAt).toISOString());
      toast.success(`Follow-up scheduled for "${selectedLead?.businessName}".`);
      onClose();
      router.refresh();
    } catch (error: any) {
      toast.error("Failed: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Schedule Follow-Up</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manually schedule a retry or callback for any lead.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Lead selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Lead
            </label>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name, phone, or campaign…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setLeadId(""); }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
            />

            {/* Selected lead display */}
            {selectedLead && (
              <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 mb-2">
                <div>
                  <span className="text-sm font-medium text-blue-900">{selectedLead.businessName}</span>
                  <span className="text-xs text-blue-500 ml-2">{selectedLead.phone}</span>
                  {selectedLead.campaign && (
                    <span className="text-xs text-blue-400 ml-2">— {selectedLead.campaign.name}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setLeadId(""); setSearch(""); }}
                  className="text-blue-400 hover:text-blue-600 text-xs"
                >
                  Change
                </button>
              </div>
            )}

            {/* Dropdown list — shown while searching and no lead selected */}
            {!selectedLead && search.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
                {filteredLeads.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400">No leads found.</p>
                ) : (
                  filteredLeads.slice(0, 20).map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => { setLeadId(lead.id); setSearch(""); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900">{lead.businessName}</span>
                      <span className="text-xs text-gray-400 ml-2">{lead.phone}</span>
                      {lead.campaign && (
                        <span className="text-xs text-gray-400 ml-2">— {lead.campaign.name}</span>
                      )}
                      <span className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        lead.status === "QUALIFIED" ? "bg-green-50 text-green-700" :
                        lead.status === "PENDING_FOLLOWUP" ? "bg-violet-50 text-violet-700" :
                        lead.status === "PENDING_RETRY" ? "bg-amber-50 text-amber-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {lead.status}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Follow-Up Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("PENDING_RETRY")}
                className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                  type === "PENDING_RETRY"
                    ? "border-amber-400 bg-amber-50 ring-1 ring-amber-400"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                  type === "PENDING_RETRY" ? "border-amber-500 bg-amber-500" : "border-gray-300"
                }`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">Retry Call</p>
                  <p className="text-xs text-gray-400 mt-0.5">No answer / voicemail</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType("PENDING_FOLLOWUP")}
                className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                  type === "PENDING_FOLLOWUP"
                    ? "border-violet-400 bg-violet-50 ring-1 ring-violet-400"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                  type === "PENDING_FOLLOWUP" ? "border-violet-500 bg-violet-500" : "border-gray-300"
                }`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">Callback</p>
                  <p className="text-xs text-gray-400 mt-0.5">Interested lead</p>
                </div>
              </button>
            </div>
          </div>

          {/* Date & time */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Scheduled Date & Time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !leadId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scheduling…
                </>
              ) : (
                "Schedule Follow-Up"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
