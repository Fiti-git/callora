"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Step-2 of the tenant login flow when the account has 2FA enabled.
 * The challenge token is stashed in sessionStorage by the /login page after
 * the step-1 backend response says `requires2FA`.
 */
export default function TwoFactorLoginPage() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const c = sessionStorage.getItem("callora_2fa_challenge");
    if (!c) {
      router.replace("/login");
      return;
    }
    setChallenge(c);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      challengeToken: challenge,
      twoFAToken: useRecovery ? "" : code,
      recoveryCode: useRecovery ? recovery : "",
      redirect: false,
    });
    setLoading(false);
    if (res?.ok) {
      sessionStorage.removeItem("callora_2fa_challenge");
      router.push("/dashboard");
      return;
    }
    setError("Invalid code. Please try again.");
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
            Two-factor authentication
          </h1>
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
            {useRecovery
              ? "Enter one of your recovery codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {useRecovery ? (
              <input
                type="text"
                value={recovery}
                onChange={(e) => setRecovery(e.target.value.trim())}
                required
                placeholder="recovery-code"
                className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-navy-700 focus:border-brand-500 focus:outline-none dark:!border-white/10 dark:!bg-navy-800 dark:text-white"
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                placeholder="123456"
                className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-center text-lg tracking-widest text-navy-700 focus:border-brand-500 focus:outline-none dark:!border-white/10 dark:!bg-navy-800 dark:text-white"
              />
            )}

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
              {loading ? "Verifying..." : "Verify"}
            </button>

            <button
              type="button"
              onClick={() => {
                setUseRecovery((v) => !v);
                setError("");
              }}
              className="block w-full text-center text-xs text-brand-500 hover:text-brand-600"
            >
              {useRecovery
                ? "Use authenticator code instead"
                : "Use a recovery code"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
