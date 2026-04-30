"use client";

import { useEffect, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import {
  attachPaymentMethod,
  chargeFirstTopUp,
  createSetupIntent,
  startProvisioning,
} from "@/app/actions/onboarding";

/**
 * Phase 5 Agent M6 — Step 1: payment method + first $25 top-up.
 *
 * Flow:
 *   1. mount      -> create SetupIntent on the server, get clientSecret
 *   2. user fills -> stripe.confirmSetup() returns paymentMethodId
 *   3. server     -> attach as default + charge first $25
 *   4. server     -> kick off provisioning orchestrator
 *   5. client     -> advance the wizard to Step 2
 */

export default function PaymentStep({ onComplete }: { onComplete: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { clientSecret } = await createSetupIntent();
        if (!cancelled) setClientSecret(clientSecret);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not start payment setup. Please try again."
          );
          setLoadFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadFailed) {
    return (
      <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
        {error ?? "Payment setup failed. Please refresh and try again."}
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <Spinner /> Preparing secure payment form…
      </div>
    );
  }

  let stripePromise: ReturnType<typeof getStripe>;
  try {
    stripePromise = getStripe();
  } catch (err) {
    return (
      <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
        {err instanceof Error ? err.message : "Payment system unavailable."}
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm onComplete={onComplete} />
    </Elements>
  );
}

function PaymentForm({ onComplete }: { onComplete: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<
    "idle" | "confirming" | "charging" | "provisioning" | "done"
  >("idle");
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stripe || !elements) return;

    setStage("confirming");
    const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (confirmErr) {
      setError(confirmErr.message ?? "Could not confirm your card.");
      setStage("idle");
      return;
    }

    const paymentMethodId = setupIntent?.payment_method;
    if (typeof paymentMethodId !== "string") {
      setError("Could not retrieve payment method. Please try again.");
      setStage("idle");
      return;
    }

    startTransition(async () => {
      try {
        await attachPaymentMethod(paymentMethodId);
        setStage("charging");
        await chargeFirstTopUp();
        setStage("provisioning");
        await startProvisioning();
        setStage("done");
        onComplete();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "We couldn't process your card. Please try a different one."
        );
        setStage("idle");
      }
    });
  }

  const busy =
    stage === "confirming" ||
    stage === "charging" ||
    stage === "provisioning" ||
    pending;

  const buttonLabel =
    stage === "confirming"
      ? "Verifying card…"
      : stage === "charging"
        ? "Charging $25…"
        : stage === "provisioning"
          ? "Activating account…"
          : "Add $25 in credits";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Add your card to start. We charge a one-time $25 to seed your call
        credits — every call, lead-discovery search, and email send is
        deducted from this balance. You can pause or refill any time.
      </p>

      <div className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
        <PaymentElement />
      </div>

      {error ? (
        <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!stripe || busy}
        className="linear flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 dark:bg-brand-400 dark:hover:bg-brand-300"
      >
        {busy ? <Spinner /> : null}
        {buttonLabel}
      </button>

      <p className="text-center text-[11px] text-gray-400 dark:text-gray-500">
        Payments are processed securely by Stripe. We never store your card.
      </p>
    </form>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
