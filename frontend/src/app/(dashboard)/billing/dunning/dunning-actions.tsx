"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openBillingPortal, payDunningNow } from "@/app/actions/billing-status";

export default function DunningActions() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handlePortal = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await openBillingPortal();
      if (r.url) {
        window.location.href = r.url;
      } else {
        setMessage(r.error ?? "Could not open billing portal");
      }
    });
  };

  const handlePayNow = () => {
    setMessage(null);
    setSuccess(false);
    startTransition(async () => {
      const r = await payDunningNow();
      if (r.paid) {
        setSuccess(true);
        setMessage("Payment recovered. Your account is active.");
        router.refresh();
      } else {
        setMessage(r.error ?? "Payment failed. Try updating your payment method.");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handlePortal}
          disabled={pending}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Working..." : "Update Payment Method"}
        </button>
        <button
          type="button"
          onClick={handlePayNow}
          disabled={pending}
          className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Charging..." : "Pay Now"}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${success ? "text-emerald-400" : "text-amber-300"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
