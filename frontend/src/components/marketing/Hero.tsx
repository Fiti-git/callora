"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Decorations } from "./Decorations";

const ROTATING = [
  "Vancouver Dentists",
  "Singapore Lawyers",
  "Toronto Accountants",
  "BC Real Estate",
];

const FAKE_LEADS = [
  { name: "Northwood Tax & Advisory", score: 91 },
  { name: "Maple Ridge CPA Group", score: 87 },
  { name: "Harborfront Accounting Co.", score: 82 },
];

export function Hero() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % ROTATING.length), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative overflow-hidden bg-white min-h-screen pt-20 pb-32 flex flex-col items-center justify-center">
      <Decorations variant="dense" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center">
        <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6">
          AI-Powered Outbound Calling · Canada &amp; Singapore
        </span>

        <h1 className="text-5xl md:text-7xl font-bold text-[#1A1A1A] tracking-tight leading-[1.05] max-w-4xl">
          Your next client is one call away.
        </h1>

        <div className="mt-6 h-9 flex items-center justify-center">
          <span className="text-2xl md:text-3xl font-semibold text-[#DC0014] transition-opacity duration-300">
            {ROTATING[idx]}
          </span>
        </div>

        <p className="mt-6 text-lg text-[#666] max-w-2xl">
          Callora finds real businesses, qualifies them with Gemini AI, and calls
          them on your behalf. You only speak to leads who are already
          interested.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/register"
            className="bg-[#DC0014] text-white rounded-full px-6 py-3 font-semibold hover:bg-[#b8000f] transition-colors"
          >
            Start Free Trial
          </Link>
          <a
            href="#how-it-works"
            className="border border-[#1A1A1A] text-[#1A1A1A] rounded-full px-6 py-3 font-semibold hover:bg-[#F9F9F9] transition-colors"
          >
            See How It Works
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[#999]">
          <span className="flex items-center gap-1.5">
            <Check /> 14-day free trial
          </span>
          <span className="flex items-center gap-1.5">
            <Check /> No credit card
          </span>
          <span className="flex items-center gap-1.5">
            <Check /> Cancel anytime
          </span>
        </div>

        <div className="relative mt-16 w-full max-w-4xl">
          <div className="rounded-2xl shadow-2xl border border-[#F0F0F0] bg-white overflow-hidden text-left">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
              <span className="ml-3 text-xs text-[#999] font-mono">
                callora · campaigns
              </span>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-[#999]">Active campaign</div>
                  <div className="text-lg font-semibold text-[#1A1A1A]">
                    Toronto Accountants Q2
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Running
                </span>
              </div>

              <div className="mb-1 flex items-center justify-between text-xs text-[#666]">
                <span>Progress</span>
                <span>39%</span>
              </div>
              <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden mb-6">
                <div className="h-full bg-[#DC0014] rounded-full" style={{ width: "39%" }} />
              </div>

              <div className="space-y-2">
                {FAKE_LEADS.map((l) => (
                  <div
                    key={l.name}
                    className="flex items-center justify-between p-3 border border-[#F0F0F0] rounded-lg hover:bg-[#FAFAFA] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-[#F5F5F5] text-[#1A1A1A] text-xs font-semibold flex items-center justify-center shrink-0">
                        {l.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-sm font-medium text-[#1A1A1A] truncate">
                        {l.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-[#1A1A1A]">
                        {l.score}
                      </span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#DC0014]/10 text-[#DC0014]">
                        Qualified
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
