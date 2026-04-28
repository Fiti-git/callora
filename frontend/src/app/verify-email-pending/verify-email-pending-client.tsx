"use client";

import Link from "next/link";
import { useState } from "react";
import { resendVerificationEmail } from "@/app/actions/auth";

export default function VerifyEmailPendingClient({
  email,
}: {
  email: string | null;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function handleResend() {
    setState("sending");
    setMessage("");
    const result = await resendVerificationEmail();
    if ("error" in result && result.error) {
      setState("error");
      setMessage(result.error);
      return;
    }
    if (result.alreadyVerified) {
      setState("sent");
      setMessage("Your email is already verified. Refresh to continue.");
      return;
    }
    setState("sent");
    setMessage("Verification email sent. Check your inbox.");
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-lightPrimary px-4 py-12 dark:bg-navy-900">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center">
          <span className="font-poppins text-[32px] font-bold uppercase text-navy-700 dark:text-white">
            Callora
          </span>
        </div>

        <div className="rounded-[20px] bg-white p-8 shadow-3xl shadow-shadow-500 dark:!bg-navy-800 dark:shadow-none">
          <h1 className="mb-2 text-2xl font-bold text-navy-700 dark:text-white">
            Check your inbox
          </h1>
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
            We&apos;ve sent a verification link
            {email ? (
              <>
                {" "}to <span className="font-medium">{email}</span>
              </>
            ) : null}
            . Click the link in that email to continue.
          </p>

          <button
            type="button"
            onClick={handleResend}
            disabled={state === "sending"}
            className="linear flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 dark:bg-brand-400 dark:hover:bg-brand-300"
          >
            {state === "sending" ? (
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
                Sending...
              </>
            ) : (
              "Resend verification email"
            )}
          </button>

          {message ? (
            <div
              className={
                "mt-4 rounded-xl px-4 py-3 text-sm " +
                (state === "error"
                  ? "bg-red-100 text-red-600 dark:bg-red-500/10"
                  : "bg-green-100 text-green-700 dark:bg-green-500/10")
              }
            >
              {message}
            </div>
          ) : null}

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Wrong account?{" "}
            <Link
              href="/login"
              className="font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Sign in with another email
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
