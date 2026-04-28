"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markPlanChosen } from "@/app/actions/onboarding";

export default function OnboardingPostCheckout() {
  const router = useRouter();
  const fired = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    (async () => {
      try {
        await markPlanChosen();
        router.replace("/onboarding");
        router.refresh();
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save plan selection. Refresh to try again."
        );
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-lightPrimary px-4 py-12 dark:bg-navy-900">
      <div className="w-full max-w-md">
        <div className="rounded-[20px] bg-white p-8 text-center shadow-3xl shadow-shadow-500 dark:!bg-navy-800 dark:shadow-none">
          <h1 className="mb-2 text-2xl font-bold text-navy-700 dark:text-white">
            Thanks for subscribing!
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Setting up the next step...
          </p>
          <div className="mt-4 flex justify-center">
            <svg
              className="h-5 w-5 animate-spin text-brand-500 dark:text-brand-400"
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
          </div>
          {error ? (
            <div className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
