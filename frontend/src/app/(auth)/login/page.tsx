"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.ok) {
      router.push("/dashboard");
      return;
    }
    // NextAuth surfaces our thrown Error.message via res.error
    const errMsg = res?.error || "";
    if (errMsg.startsWith("REQUIRES_2FA:")) {
      const challenge = errMsg.slice("REQUIRES_2FA:".length);
      sessionStorage.setItem("callora_2fa_challenge", challenge);
      router.push("/login/2fa");
      return;
    }
    if (errMsg === "EMAIL_NOT_VERIFIED") {
      router.push(`/verify-email-pending?email=${encodeURIComponent(email)}`);
      return;
    }
    setError("Invalid email or password. Please try again.");
  };

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
            Sign In
          </h1>
          <p className="mb-7 text-sm text-gray-600">
            Enter your email and password to sign in.
          </p>

          {/* Phase 3 Agent 12 — SSO buttons. NEXT_PUBLIC_* env flags so the
              buttons hide cleanly when SSO isn't configured server-side. */}
          {(process.env.NEXT_PUBLIC_SSO_GOOGLE_ENABLED === "true" ||
            process.env.NEXT_PUBLIC_SSO_MICROSOFT_ENABLED === "true") && (
            <div className="mb-6 space-y-3">
              {process.env.NEXT_PUBLIC_SSO_GOOGLE_ENABLED === "true" && (
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:bg-navy-700 dark:text-white"
                >
                  Continue with Google
                </button>
              )}
              {process.env.NEXT_PUBLIC_SSO_MICROSOFT_ENABLED === "true" && (
                <button
                  type="button"
                  onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:bg-navy-700 dark:text-white"
                >
                  Continue with Microsoft
                </button>
              )}
              <div className="relative my-2 flex items-center">
                <div className="flex-1 border-t border-gray-200 dark:border-white/10" />
                <span className="mx-3 text-xs text-gray-400">or</span>
                <div className="flex-1 border-t border-gray-200 dark:border-white/10" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
                Email
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
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-navy-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:!border-white/10 dark:!bg-navy-800 dark:text-white"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="mt-2 text-right">
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Forgot your password?
                </Link>
              </div>
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
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
