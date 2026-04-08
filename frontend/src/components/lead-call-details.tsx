"use client";

import { useState } from "react";

interface CallLog {
  id: string;
  summary: string | null;
  transcript: string | null;
  duration: number | null;
  status: string;
}

interface Lead {
  id: string;
  businessName: string;
  phone: string | null;
  status: string;
  interestScore: number;
  calls: CallLog[];
}

const STATUS_STYLES: Record<string, string> = {
  QUALIFIED: "bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/30",
  CALLED: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/30",
  DISQUALIFIED: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30",
  NEW: "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700",
  PENDING_RETRY: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30",
  PENDING_FOLLOWUP: "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30",
};

export function LeadCallDetails({ leads }: { leads: Lead[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const calledLeads = leads.filter((l) => l.calls && l.calls.length > 0);

  if (calledLeads.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
        Call Details <span className="text-gray-400 dark:text-gray-500 font-normal">({calledLeads.length})</span>
      </h2>
      <div className="space-y-2">
        {calledLeads.map((lead) => {
          const call = lead.calls[0];
          const isOpen = openId === lead.id;

          return (
            <div key={lead.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              {/* Row */}
              <button
                onClick={() => setOpenId(isOpen ? null : lead.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors text-left gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {lead.businessName}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{lead.phone}</div>
                  </div>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium flex-shrink-0 ${
                    STATUS_STYLES[lead.status] || STATUS_STYLES.NEW
                  }`}>
                    {lead.status}
                  </span>
                  {lead.interestScore > 0 && (
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                      {lead.interestScore}/10
                    </span>
                  )}
                  {call.duration != null && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {call.duration}s
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {call.summary && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs truncate hidden md:block">
                      {call.summary}
                    </p>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded */}
              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {call.summary && (
                    <div className="px-5 py-4">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Summary</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{call.summary}</p>
                    </div>
                  )}
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Transcript</p>
                    {call.transcript ? (
                      <TranscriptView raw={call.transcript} />
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-gray-500 italic">No transcript available.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TranscriptView({ raw }: { raw: string }) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {parsed.map((turn: any, i: number) => {
            const role = turn.role || turn.speaker || "unknown";
            const text = turn.message || turn.text || turn.content || "";
            const isAgent = role === "assistant" || role === "bot" || role === "agent";

            return (
              <div key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-lg px-3.5 py-2.5 text-sm ${
                  isAgent
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                    : "bg-blue-600 text-white"
                }`}>
                  <span className="block text-[10px] font-semibold mb-1 opacity-60 uppercase tracking-wide">
                    {role}
                  </span>
                  {text}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700">
        {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    return (
      <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 font-sans leading-relaxed">
        {raw}
      </pre>
    );
  }
}
