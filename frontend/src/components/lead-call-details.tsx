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
  QUALIFIED: "bg-green-50 text-green-700 ring-1 ring-green-200",
  CALLED: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  DISQUALIFIED: "bg-red-50 text-red-700 ring-1 ring-red-200",
  NEW: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

export function LeadCallDetails({ leads }: { leads: Lead[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const calledLeads = leads.filter((l) => l.calls && l.calls.length > 0);

  if (calledLeads.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">
        Call Details <span className="text-gray-400 font-normal">({calledLeads.length})</span>
      </h2>
      <div className="space-y-2">
        {calledLeads.map((lead) => {
          const call = lead.calls[0];
          const isOpen = openId === lead.id;

          return (
            <div key={lead.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Row */}
              <button
                onClick={() => setOpenId(isOpen ? null : lead.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {lead.businessName}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 font-mono">{lead.phone}</div>
                  </div>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium flex-shrink-0 ${
                    STATUS_STYLES[lead.status] || STATUS_STYLES.NEW
                  }`}>
                    {lead.status}
                  </span>
                  {lead.interestScore > 0 && (
                    <span className="text-xs font-semibold text-gray-600 flex-shrink-0">
                      {lead.interestScore}/10
                    </span>
                  )}
                  {call.duration != null && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {call.duration}s
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {call.summary && (
                    <p className="text-xs text-gray-400 max-w-xs truncate hidden md:block">
                      {call.summary}
                    </p>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
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
                <div className="border-t border-gray-100 divide-y divide-gray-100">
                  {call.summary && (
                    <div className="px-5 py-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Summary</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{call.summary}</p>
                    </div>
                  )}
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Transcript</p>
                    {call.transcript ? (
                      <TranscriptView raw={call.transcript} />
                    ) : (
                      <p className="text-sm text-gray-400 italic">No transcript available.</p>
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
                    ? "bg-gray-100 text-gray-800"
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
      <pre className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-80 overflow-y-auto border border-gray-200">
        {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    return (
      <pre className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-80 overflow-y-auto border border-gray-200 font-sans leading-relaxed">
        {raw}
      </pre>
    );
  }
}
