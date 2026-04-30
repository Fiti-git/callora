"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { openBillingPortal } from "@/app/actions/billing-status";

interface Props {
  orgStatus: string | null | undefined;
}

/**
 * PAST_DUE / SUSPENDED banner. Mounted in (dashboard)/layout.tsx so it
 * appears on every authenticated page until the user resolves their
 * billing state. SUSPENDED is the louder red variant; PAST_DUE is yellow.
 *
 * The "Update Payment Method" button kicks off a Stripe Customer Portal
 * session via the `openBillingPortal` server action. It also surfaces a
 * link to the dunning detail page where the user can pay-now.
 */
export default function BillingStatusBanner({ orgStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (orgStatus !== "PAST_DUE" && orgStatus !== "SUSPENDED") return null;

  const isSuspended = orgStatus === "SUSPENDED";

  const wrapperClass = isSuspended
    ? "bg-red-600 text-white"
    : "bg-amber-500 text-amber-950";

  const message = isSuspended
    ? "Account suspended — restore by updating payment."
    : "Update payment method to keep your account active.";

  const handlePortal = () => {
    startTransition(async () => {
      const r = await openBillingPortal();
      if (r.url) {
        window.location.href = r.url;
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className={`${wrapperClass} text-sm py-2 px-4 flex items-center justify-center gap-3`}>
      <strong>{isSuspended ? "Account suspended:" : "Payment past due:"}</strong>
      <span>{message}</span>
      <button
        type="button"
        onClick={handlePortal}
        disabled={pending}
        className="ml-2 px-3 py-1 rounded bg-black/80 hover:bg-black text-white text-xs font-semibold disabled:opacity-60"
      >
        {pending ? "Opening..." : "Update Payment Method"}
      </button>
      <Link
        href="/billing/dunning"
        className="underline text-xs font-semibold opacity-90 hover:opacity-100"
      >
        Details
      </Link>
    </div>
  );
}
