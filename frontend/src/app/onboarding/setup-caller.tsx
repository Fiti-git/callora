"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCallerSettings } from "@/app/actions/onboarding";

interface Props {
  initial: {
    aiCallerName: string;
    aiCallerCompany: string;
    aiSystemPrompt: string;
    vapiPhoneNumber?: string | null;
  };
}

export default function OnboardingSetupCaller({ initial }: Props) {
  const router = useRouter();
  const [aiCallerName, setAiCallerName] = useState(
    initial.aiCallerName || "Alex"
  );
  const [aiCallerCompany, setAiCallerCompany] = useState(
    initial.aiCallerCompany || ""
  );
  const [aiSystemPrompt, setAiSystemPrompt] = useState(
    initial.aiSystemPrompt || ""
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!aiCallerName.trim()) {
      setError("Please give your AI caller a name.");
      return;
    }
    if (!aiCallerCompany.trim()) {
      setError("Please enter your company name.");
      return;
    }

    startTransition(async () => {
      try {
        await saveCallerSettings({
          aiCallerName: aiCallerName.trim(),
          aiCallerCompany: aiCallerCompany.trim(),
          aiSystemPrompt: aiSystemPrompt.trim(),
        });
        router.push("/dashboard");
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save settings. Try again."
        );
      }
    });
  }

  const inputClass =
    "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-navy-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:!border-white/10 dark:!bg-navy-800 dark:text-white";
  const labelClass =
    "mb-1.5 block text-sm font-medium text-navy-700 dark:text-white";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Tell us a little about your AI caller. You can refine these details any
        time from Settings.
      </p>

      <div>
        <label className={labelClass}>Your AI caller&apos;s name</label>
        <input
          type="text"
          required
          maxLength={50}
          className={inputClass}
          placeholder="Alex"
          value={aiCallerName}
          onChange={(e) => setAiCallerName(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Your company name</label>
        <input
          type="text"
          required
          maxLength={100}
          className={inputClass}
          placeholder="Acme Corp"
          value={aiCallerCompany}
          onChange={(e) => setAiCallerCompany(e.target.value)}
        />
      </div>

      {initial.vapiPhoneNumber ? (
        <div>
          <label className={labelClass}>Your dedicated outbound number</label>
          <div className="flex h-12 w-full items-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-mono text-navy-700 dark:!border-white/10 dark:!bg-navy-900 dark:text-white">
            {initial.vapiPhoneNumber}
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-500/20 dark:text-green-400">
              Active
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            This number was automatically provisioned for your account. All outbound calls will appear from this number.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          Your dedicated phone number is being provisioned — it will be ready within a few seconds.
        </div>
      )}

      <div>
        <label className={labelClass}>
          What should the AI say about your offer?
        </label>
        <textarea
          rows={4}
          maxLength={2000}
          className={`${inputClass} h-auto resize-y py-3`}
          placeholder={`We help small businesses get more clients with AI-powered calling.\nOur typical customer sees a 30% increase in booked appointments.\nThe goal is to book a 15-minute discovery call.`}
          value={aiSystemPrompt}
          onChange={(e) => setAiSystemPrompt(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
          {aiSystemPrompt.length}/2000 characters
        </p>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="linear flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 dark:bg-brand-400 dark:hover:bg-brand-300"
      >
        {pending ? (
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
            Saving...
          </>
        ) : (
          "Finish setup"
        )}
      </button>
    </form>
  );
}
