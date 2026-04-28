"use client";

import { useState } from "react";
import { startCheckout } from "@/app/actions/onboarding";

type Tier = "STARTER" | "PRO" | "ENTERPRISE";

interface PlanCard {
  tier: Tier;
  name: string;
  price: string;
  cadence: string;
  highlight?: boolean;
  features: string[];
}

const PLANS: PlanCard[] = [
  {
    tier: "STARTER",
    name: "Starter",
    price: "$49",
    cadence: "/month",
    features: [
      "500 AI calls / month",
      "5,000 leads scraped / month",
      "1 seat",
      "Email support",
    ],
  },
  {
    tier: "PRO",
    name: "Pro",
    price: "$199",
    cadence: "/month",
    highlight: true,
    features: [
      "2,500 AI calls / month",
      "25,000 leads scraped / month",
      "5 seats",
      "Priority support",
    ],
  },
  {
    tier: "ENTERPRISE",
    name: "Enterprise",
    price: "$499",
    cadence: "/month",
    features: [
      "10,000 AI calls / month",
      "100,000 leads scraped / month",
      "Unlimited seats",
      "Dedicated account manager",
    ],
  },
];

export default function OnboardingChoosePlan() {
  const [pendingTier, setPendingTier] = useState<Tier | null>(null);
  const [error, setError] = useState("");

  async function handleSelect(tier: Tier) {
    setError("");
    setPendingTier(tier);
    try {
      const { url } = await startCheckout(tier);
      window.location.href = url;
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start checkout. Try again."
      );
      setPendingTier(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Pick the plan that fits how many calls you&apos;ll be making. You can
        change or cancel any time from Billing.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.tier}
            className={
              "flex flex-col rounded-2xl border p-5 " +
              (plan.highlight
                ? "border-brand-500 bg-brand-50/50 dark:border-brand-400 dark:bg-brand-400/5"
                : "border-gray-200 bg-white dark:border-white/10 dark:bg-navy-900/40")
            }
          >
            {plan.highlight ? (
              <span className="mb-2 inline-flex w-fit items-center rounded-full bg-brand-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Most popular
              </span>
            ) : null}
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              {plan.name}
            </h3>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-navy-700 dark:text-white">
                {plan.price}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {plan.cadence}
              </span>
            </div>

            <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1 inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500 dark:bg-brand-400"
                  />
                  {f}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => handleSelect(plan.tier)}
              disabled={pendingTier !== null}
              className={
                "linear mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition duration-200 disabled:opacity-60 " +
                (plan.highlight
                  ? "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300"
                  : "border border-gray-200 bg-white text-navy-700 hover:bg-lightPrimary dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-navy-700")
              }
            >
              {pendingTier === plan.tier ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Redirecting...
                </>
              ) : (
                "Get started"
              )}
            </button>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
          {error}
        </div>
      ) : null}
    </div>
  );
}
