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

export function LeadCallDetails({ leads }: { leads: Lead[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const calledLeads = leads.filter((l) => l.calls && l.calls.length > 0);

  if (calledLeads.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Call Details</h2>
      <div className="space-y-3">
        {calledLeads.map((lead) => {
          const call = lead.calls[0];
          const isOpen = openId === lead.id;

          return (
            <div
              key={lead.id}
              className="bg-white shadow rounded-lg overflow-hidden"
            >
              {/* Header row - always visible */}
              <button
                onClick={() => setOpenId(isOpen ? null : lead.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-medium text-gray-900">
                      {lead.businessName}
                    </div>
                    <div className="text-sm text-gray-500">{lead.phone}</div>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      lead.status === "QUALIFIED"
                        ? "bg-green-100 text-green-800"
                        : lead.status === "CALLED"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {lead.status}
                  </span>
                  {lead.interestScore > 0 && (
                    <span className="text-sm text-gray-600 font-medium">
                      {lead.interestScore}/10
                    </span>
                  )}
                  {call.duration != null && (
                    <span className="text-sm text-gray-400">
                      {call.duration}s
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {call.summary && (
                    <p className="text-sm text-gray-500 max-w-md truncate hidden md:block">
                      {call.summary}
                    </p>
                  )}
                  <svg
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t divide-y divide-gray-100">
                  {/* Summary */}
                  {call.summary && (
                    <div className="px-6 py-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                        Summary
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {call.summary}
                      </p>
                    </div>
                  )}

                  {/* Full Transcript */}
                  <div className="px-6 py-4">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                      Full Conversation
                    </h4>
                    {call.transcript ? (
                      <TranscriptView raw={call.transcript} />
                    ) : (
                      <p className="text-sm text-gray-400 italic">
                        No transcript available.
                      </p>
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
  // Try to parse structured transcript (array of {role, message} objects)
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {parsed.map((turn: any, i: number) => {
            const role = turn.role || turn.speaker || "unknown";
            const text = turn.message || turn.text || turn.content || "";
            const isAssistant =
              role === "assistant" || role === "bot" || role === "agent";

            return (
              <div
                key={i}
                className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                    isAssistant
                      ? "bg-blue-50 text-blue-900"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <span className="block text-xs font-semibold mb-1 opacity-60 capitalize">
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

    // If parsed but not an array, show as plain text
    return (
      <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-96 overflow-y-auto">
        {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    // Not JSON — plain text transcript
    return (
      <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-96 overflow-y-auto font-sans">
        {raw}
      </pre>
    );
  }
}
