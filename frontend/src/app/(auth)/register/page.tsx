"use client";

import { register } from "@/app/actions/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    setError("");
    setLoading(true);
    try {
      await register(formData);
      router.push("/login");
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-navy-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:!border-white/10 dark:!bg-navy-800 dark:text-white";
  const labelClass =
    "mb-1.5 block text-sm font-medium text-navy-700 dark:text-white";

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
            Create your account
          </h1>
          <p className="mb-7 text-sm text-gray-600">
            Start your free trial. No credit card required.
          </p>

          <form className="space-y-4" action={handleSubmit}>
            <div>
              <label className={labelClass}>Full name</label>
              <input
                name="name"
                type="text"
                required
                autoComplete="name"
                className={inputClass}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className={labelClass}>Company name</label>
              <input
                name="orgName"
                type="text"
                required
                className={inputClass}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className={labelClass}>Work email</label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className={inputClass}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input
                name="password"
                type="password"
                required
                autoComplete="new-password"
                className={inputClass}
                placeholder="Choose a strong password"
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
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </button>
            <p className="mt-3 text-center text-xs text-gray-600">
              By creating an account you agree to our{" "}
              <Link
                href="/terms"
                className="font-medium text-brand-500 hover:text-brand-600"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="font-medium text-brand-500 hover:text-brand-600"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
