"use client";

import { useState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
          <h1 className="mb-2 text-3xl font-bold text-navy-700 dark:text-white">
            Reset your password
          </h1>
          <p className="mb-7 text-sm text-gray-600">
            Enter the email associated with your account and we&apos;ll send you a reset link.
          </p>

          {submitted ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-green-100 px-4 py-3 text-sm text-green-700 dark:bg-green-500/10">
                If that email is registered, you&apos;ll receive a reset link shortly. Check your inbox.
              </div>
              <p className="text-sm">
                <Link
                  href="/login"
                  className="font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  &larr; Back to sign in
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-navy-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:!border-white/10 dark:!bg-navy-800 dark:text-white"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {error ? (
                <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="linear flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 dark:bg-brand-400 dark:hover:bg-brand-300"
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  "Send reset link"
                )}
              </button>

              <p className="text-center text-sm text-gray-600">
                <Link
                  href="/login"
                  className="font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
