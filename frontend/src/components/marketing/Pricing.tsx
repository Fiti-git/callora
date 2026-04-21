"use client";

import Link from "next/link";
import { useState } from "react";

type Currency = "CAD" | "SGD";

type Plan = {
  name: string;
  price: { CAD: string; SGD: string };
  tagline: string;
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    price: { CAD: "CA$99", SGD: "S$109" },
    tagline: "For solo founders testing outbound.",
    cta: "Start Free Trial",
    ctaHref: "/register",
    features: [
      "500 calls / month",
      "1,000 leads scraped",
      "1 user seat",
      "Basic analytics",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: { CAD: "CA$249", SGD: "S$279" },
    tagline: "For growing sales teams.",
    cta: "Start Free Trial",
    ctaHref: "/register",
    highlighted: true,
    features: [
      "2,000 calls / month",
      "5,000 leads scraped",
      "5 user seats",
      "Full analytics dashboard",
      "Priority email support",
    ],
  },
  {
    name: "Business",
    price: { CAD: "CA$499", SGD: "S$559" },
    tagline: "For agencies & high-volume teams.",
    cta: "Start Free Trial",
    ctaHref: "/register",
    features: [
      "5,000 calls / month",
      "15,000 leads scraped",
      "15 user seats",
      "Custom AI voice training",
      "Priority chat support",
    ],
  },
  {
    name: "Enterprise",
    price: { CAD: "Custom", SGD: "Custom" },
    tagline: "For large operations.",
    cta: "Talk to Sales",
    ctaHref: "mailto:hello@callora.ai",
    features: [
      "Unlimited calls",
      "Unlimited leads",
      "Unlimited seats",
      "Dedicated account manager",
      "SLA & onboarding",
    ],
  },
];

export function Pricing({ showHeading = true }: { showHeading?: boolean } = {}) {
  const [currency, setCurrency] = useState<Currency>("CAD");

  return (
    <section id="pricing" className="bg-[#F9F9F9] py-24">
      <div className="max-w-7xl mx-auto px-6">
        {showHeading && (
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6 bg-white">
              PRICING
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
              Straightforward pricing. No surprises.
            </h2>
          </div>
        )}

        <div className="flex justify-center mb-10">
          <div className="inline-flex p-1 rounded-full bg-white border border-[#E8E8E8]">
            {(["CAD", "SGD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  currency === c
                    ? "bg-[#DC0014] text-white"
                    : "text-[#666] hover:text-[#1A1A1A]"
                }`}
              >
                {c === "CAD" ? "CAD $" : "SGD $"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl p-6 flex flex-col border transition-shadow ${
                plan.highlighted
                  ? "border-[#DC0014] shadow-xl"
                  : "border-[#E8E8E8] hover:shadow-md"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#DC0014] text-white text-[10px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                  Most Popular
                </span>
              )}

              <div className="text-sm font-semibold text-[#1A1A1A]">{plan.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[#1A1A1A]">
                  {plan.price[currency]}
                </span>
                {plan.price[currency] !== "Custom" && (
                  <span className="text-sm text-[#999]">/mo</span>
                )}
              </div>
              <p className="mt-2 text-sm text-[#666]">{plan.tagline}</p>

              <div className="my-6 h-px bg-[#F0F0F0]" />

              <ul className="space-y-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#444]">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#DC0014"
                      strokeWidth="3"
                      className="shrink-0 mt-1"
                    >
                      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`mt-6 inline-flex justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? "bg-[#DC0014] text-white hover:bg-[#b8000f]"
                    : "border border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#F9F9F9]"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
