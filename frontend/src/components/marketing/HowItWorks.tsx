"use client";

import { useState } from "react";
import { Decorations } from "./Decorations";

const STEPS = [
  {
    title: "Discover",
    description:
      "AI searches Google Places for businesses matching your criteria with verified phone numbers.",
  },
  {
    title: "Qualify",
    description:
      "Gemini AI scores every prospect. Only leads above your threshold go to the next step.",
  },
  {
    title: "Close",
    description:
      "Your branded AI caller reaches out, logs the conversation, and alerts you when a lead is qualified.",
  },
];

const DISCOVER_RESULTS = [
  { name: "Bright Smile Dental", phone: "+1 (604) 555-0142", tag: "Vancouver, BC" },
  { name: "Coastal Family Dentistry", phone: "+1 (604) 555-0188", tag: "Vancouver, BC" },
  { name: "Pacific Orthodontics", phone: "+1 (604) 555-0211", tag: "Burnaby, BC" },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);

  return (
    <section id="how-it-works" className="bg-[#F9F9F9] py-24 relative overflow-hidden">
      <Decorations variant="sparse" />
      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="max-w-3xl">
          <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6 bg-white">
            HOW IT WORKS
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
            Three steps from signup to qualified leads.
          </h2>
        </div>

        <div className="mt-14 grid md:grid-cols-2 gap-10 items-start">
          <div className="space-y-2">
            {STEPS.map((step, i) => {
              const isActive = i === active;
              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`w-full text-left flex gap-4 pl-4 py-4 border-l-2 transition-colors ${
                    isActive
                      ? "border-[#DC0014]"
                      : "border-[#E8E8E8] hover:border-[#C8C8C8]"
                  }`}
                >
                  <div
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                      isActive
                        ? "bg-[#DC0014] text-white"
                        : "bg-white border border-[#E8E8E8] text-[#666]"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[#1A1A1A]">
                      {step.title}
                    </div>
                    <p className="mt-1 text-sm text-[#666] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-white shadow-lg rounded-2xl p-6 border border-[#F0F0F0] min-h-[360px]">
            {active === 0 && (
              <div>
                <div className="text-xs font-semibold text-[#666] mb-4 uppercase tracking-wider">
                  Discovered businesses
                </div>
                <div className="space-y-3">
                  {DISCOVER_RESULTS.map((r) => (
                    <div
                      key={r.name}
                      className="p-4 rounded-xl border border-[#F0F0F0] hover:border-[#E0E0E0] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#1A1A1A]">
                            {r.name}
                          </div>
                          <div className="text-xs text-[#666] mt-0.5 font-mono">
                            {r.phone}
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F5F5] text-[#666] shrink-0">
                          {r.tag}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {active === 1 && (
              <div>
                <div className="text-xs font-semibold text-[#666] mb-4 uppercase tracking-wider">
                  Qualification result
                </div>
                <div className="p-5 rounded-xl border border-[#F0F0F0]">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="text-base font-semibold text-[#1A1A1A]">
                        Bright Smile Dental
                      </div>
                      <div className="text-xs text-[#666] mt-0.5">
                        Vancouver, BC · Family practice
                      </div>
                    </div>
                    <div className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#DC0014]/10 text-[#DC0014]">
                      82 / 100
                    </div>
                  </div>

                  <div className="space-y-2">
                    {[
                      { l: "Recently expanded location", v: 0.9 },
                      { l: "Verified phone number", v: 1 },
                      { l: "Active website + booking", v: 0.85 },
                      { l: "No DNCL match", v: 1 },
                    ].map((row) => (
                      <div key={row.l} className="flex items-center gap-3">
                        <div className="text-xs text-[#666] flex-1">{row.l}</div>
                        <div className="w-24 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#DC0014] rounded-full"
                            style={{ width: `${row.v * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {active === 2 && (
              <div>
                <div className="text-xs font-semibold text-[#666] mb-4 uppercase tracking-wider">
                  Latest call log
                </div>
                <div className="p-5 rounded-xl border border-[#F0F0F0]">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-base font-semibold text-[#1A1A1A]">
                        Coastal Family Dentistry
                      </div>
                      <div className="text-xs text-[#666] mt-0.5">
                        2m 14s · Apr 18, 10:42
                      </div>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Qualified
                    </span>
                  </div>

                  <div className="bg-[#FAFAFA] rounded-lg p-4 text-sm text-[#444] leading-relaxed">
                    <span className="font-semibold text-[#1A1A1A]">AI:</span>{" "}
                    Hi, I'm calling on behalf of NorthShore Marketing — are you the
                    person who handles new patient acquisition?
                    <br />
                    <span className="font-semibold text-[#1A1A1A]">Lead:</span>{" "}
                    Yes, that's me. We've actually been looking at this — could you
                    send some details?
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-[#666]">
                    <span className="px-2 py-0.5 rounded-full bg-[#F5F5F5]">
                      Interested
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#F5F5F5]">
                      Follow-up booked
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
