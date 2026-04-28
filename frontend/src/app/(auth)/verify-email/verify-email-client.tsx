"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { resendVerificationEmail, verifyEmail } from "@/app/actions/auth";

type Status = "loading" | "success" | "error";

export default function VerifyEmailClient({
  isLoggedIn,
}: {
  isLoggedIn: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [resendState, setResendState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await verifyEmail(token);
      if (cancelled) return;
      if ("error" in result && result.error) {
        setErrorMsg(result.error);
        setStatus("error");
        return;
      }
      setStatus("success");
      const target =
        ("redirect" in result && (result.redirect as string)) || "/onboarding";
      setTimeout(() => {
        router.push(target);
      }, 1500);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  async function handleResend() {
    setResendState("sending");
    setResendMsg("");
    const result = await resendVerificationEmail();
    if ("error" in result && result.error) {
      setResendState("error");
      setResendMsg(result.error);
      return;
    }
    if (result.alreadyVerified) {
      setResendState("sent");
      setResendMsg("Your email is already verified. You can sign in now.");
      return;
    }
    setResendState("sent");
    setResendMsg("Verification email sent. Check your inbox.");
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
          {status === "loading" && (
            <div className="flex flex-col items-center py-6">
              <svg
                className="h-8 w-8 animate-spin text-brand-500 dark:text-brand-400"
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
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                Verifying your email...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4 text-center">
              <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
                Email verified!
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Setting up your account...
              </p>
              <div className="flex justify-center">
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
            </div>
          )}

          {status === "error" && (
            <div className="space-y-5">
              <div>
                <h1 className="mb-2 text-2xl font-bold text-navy-700 dark:text-white">
                  Verification failed
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  We couldn&apos;t verify your email.
                </p>
              </div>

              <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
                {errorMsg || "Invalid or expired verification link."}
              </div>

              {isLoggedIn ? (
                <>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendState === "sending"}
                    className="linear flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 dark:bg-brand-400 dark:hover:bg-brand-300"
                  >
                    {resendState === "sending" ? (
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
                  {resendMsg ? (
                    <div
                      className={
                        "rounded-xl px-4 py-3 text-sm " +
                        (resendState === "error"
                          ? "bg-red-100 text-red-600 dark:bg-red-500/10"
                          : "bg-green-100 text-green-700 dark:bg-green-500/10")
                      }
                    >
                      {resendMsg}
                    </div>
                  ) : null}
                </>
              ) : (
                <Link
                  href="/login"
                  className="linear flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300"
                >
                  Back to login
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
