"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryProvisioning } from "@/app/actions/onboarding";
import { getProvisioningRawAction } from "./_actions";

/**
 * Phase 5 Agent M6 — Step 3: provisioning progress.
 *
 * Polls /api/me/provisioning-status (via getOnboardingStatus, which already
 * folds it in) every 3 seconds. Caps at 5 minutes — after that the user sees
 * a "this is taking longer than usual" line + a manual retry button.
 *
 * On READY → /dashboard. On FAILED → show brand-scrubbed reason + retry.
 */

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

const STEP_LABELS: Record<string, string> = {
  customer: "Billing account",
  paymentMethod: "Payment method",
  firstTopUp: "Initial credits",
  phoneNumber: "Business number",
  assistant: "AI dialer",
  attach: "Final setup",
};
const STEP_ORDER = [
  "customer",
  "paymentMethod",
  "firstTopUp",
  "phoneNumber",
  "assistant",
  "attach",
];

interface ProvisioningSnapshot {
  status:
    | "PENDING"
    | "PROVISIONING"
    | "READY"
    | "FAILED"
    | "SUSPENDED"
    | "DEPROVISIONED";
  steps: Record<string, "done" | "pending">;
  completedSteps: number;
  totalSteps: number;
  failureReason: string | null;
  phoneNumberE164: string | null;
}

async function fetchSnapshot(): Promise<ProvisioningSnapshot> {
  const raw = await getProvisioningRawAction();
  return {
    status: raw.status as ProvisioningSnapshot["status"],
    steps: raw.steps ?? {},
    completedSteps: raw.completedSteps ?? 0,
    totalSteps: raw.totalSteps ?? 6,
    failureReason: raw.failureReason ?? null,
    phoneNumberE164: raw.phoneNumberE164 ?? null,
  };
}

interface Props {
  initialStatus: ProvisioningSnapshot["status"];
  initialPhoneNumber: string | null;
}

export default function ProvisioningStep({
  initialStatus,
  initialPhoneNumber,
}: Props) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ProvisioningSnapshot>({
    status: initialStatus,
    steps: {},
    completedSteps: 0,
    totalSteps: 6,
    failureReason: null,
    phoneNumberE164: initialPhoneNumber,
  });
  const [polling, setPolling] = useState(true);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryPending, startRetry] = useTransition();
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;

    async function tick() {
      try {
        const next = await fetchSnapshot();
        if (cancelled) return;
        setSnapshot(next);
        if (next.status === "READY") {
          setPolling(false);
          // small UI grace period so the user sees the final ✓
          setTimeout(() => router.push("/dashboard"), 800);
          return;
        }
        if (next.status === "FAILED") {
          setPolling(false);
          return;
        }
      } catch {
        // swallow; transient network blip — keep polling
      }
      if (Date.now() - startedAt.current > MAX_POLL_DURATION_MS) {
        if (!cancelled) setPolling(false);
        return;
      }
      if (!cancelled) {
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    tick();
    return () => {
      cancelled = true;
    };
  }, [polling, router]);

  function handleRetry() {
    setRetryError(null);
    startRetry(async () => {
      try {
        await retryProvisioning();
        startedAt.current = Date.now();
        setPolling(true);
      } catch (err) {
        setRetryError(
          err instanceof Error
            ? err.message
            : "Could not retry. Please refresh and try again."
        );
      }
    });
  }

  const isFailed = snapshot.status === "FAILED";
  const isReady = snapshot.status === "READY";
  const timedOut = !polling && !isReady && !isFailed;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {isReady
          ? "All set! Redirecting you to your dashboard…"
          : isFailed
            ? "Something went wrong while activating your account."
            : "We're activating your account — usually takes 30-60 seconds."}
      </p>

      <ul className="space-y-2">
        {STEP_ORDER.map((key) => {
          const state = snapshot.steps[key] ?? "pending";
          const done = state === "done";
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-navy-900/40"
            >
              <span
                className={
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold " +
                  (done
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400")
                }
              >
                {done ? "✓" : polling ? <Spinner /> : "·"}
              </span>
              <span className="text-sm text-navy-700 dark:text-white">
                {STEP_LABELS[key]}
              </span>
            </li>
          );
        })}
      </ul>

      {isReady && snapshot.phoneNumberE164 ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400">
          Your dedicated outbound number:{" "}
          <span className="font-mono font-semibold">
            {snapshot.phoneNumberE164}
          </span>
        </div>
      ) : null}

      {isFailed ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
            {snapshot.failureReason ?? "Activation failed. Please try again."}
          </div>
          {retryError ? (
            <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
              {retryError}
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleRetry}
            disabled={retryPending}
            className="linear flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 dark:bg-brand-400 dark:hover:bg-brand-300"
          >
            {retryPending ? <Spinner /> : null}
            {retryPending ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : null}

      {timedOut ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          This is taking longer than usual. Your account is still being
          activated — feel free to refresh in a minute, or reach out to
          support if it doesn&apos;t resolve.
        </div>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
  );
}
