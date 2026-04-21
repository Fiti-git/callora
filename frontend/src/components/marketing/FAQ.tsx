"use client";

import { useState } from "react";

const ITEMS = [
  {
    q: "How does Callora find leads?",
    a: "Callora uses the Google Places API to search for verified businesses by category and location. Every result includes a real phone number, address, and the business categories Google has on file.",
  },
  {
    q: "Is this CASL compliant?",
    a: "Yes. Every campaign scrubs numbers against Canada's National Do Not Call List (DNCL) before dialling, and the AI scripts are written to satisfy CASL identification and consent requirements.",
  },
  {
    q: "What happens after a call?",
    a: "Callora logs the full transcript, an AI-generated summary, an interest score, and the call outcome. Qualified leads are flagged immediately so you can follow up while interest is hot.",
  },
  {
    q: "Can I import my own list?",
    a: "Yes — CSV upload is supported with automatic phone normalisation and de-duplication against your existing leads and blacklist.",
  },
  {
    q: "How does billing work?",
    a: "All plans are monthly subscriptions billed via Stripe. Cancel anytime, no setup fees, and your 14-day trial doesn't require a credit card.",
  },
  {
    q: "What AI powers the calls?",
    a: "Vapi.ai handles the real-time voice conversations, and Google Gemini handles lead qualification and scoring. You can configure tone, pacing, and disqualification rules per campaign.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="bg-white py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6">
            FAQ
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
            Common questions.
          </h2>
        </div>

        <div className="border-t border-[#F0F0F0]">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="border-b border-[#F0F0F0]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full text-left py-5 flex items-center justify-between gap-6"
                  aria-expanded={isOpen}
                >
                  <span className="text-base md:text-lg font-semibold text-[#1A1A1A]">
                    {item.q}
                  </span>
                  <span
                    className={`shrink-0 w-7 h-7 rounded-full border border-[#E0E0E0] flex items-center justify-center transition-transform ${
                      isOpen ? "rotate-45 bg-[#DC0014] border-[#DC0014]" : ""
                    }`}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={isOpen ? "white" : "#1A1A1A"}
                      strokeWidth="2.5"
                    >
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div className="pb-6 pr-12 text-sm text-[#666] leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
