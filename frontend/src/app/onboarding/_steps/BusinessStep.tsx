"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { saveBusinessProfile } from "@/app/actions/onboarding";

/**
 * Phase 5 Agent M6 — Step 2: caller persona.
 *
 * Mirrors the backend zod schema in `routes/me.ts` so client-side validation
 * matches server-side guarantees.
 */

const schema = z.object({
  aiCallerName: z
    .string()
    .trim()
    .min(1, "Please give your AI caller a name.")
    .max(50, "Name is too long."),
  aiCallerCompany: z
    .string()
    .trim()
    .min(1, "Please enter your company name.")
    .max(100, "Company name is too long."),
  aiSystemPrompt: z
    .string()
    .trim()
    .min(50, "Add a few sentences (at least 50 characters) so the AI has enough context.")
    .max(5000, "That's a lot of context — please keep it under 5,000 characters."),
});

type FormData = z.infer<typeof schema>;

interface Props {
  initial: {
    aiCallerName: string;
    aiCallerCompany: string;
    aiSystemPrompt: string;
  };
  onComplete: () => void;
}

export default function BusinessStep({ initial, onComplete }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      aiCallerName: initial.aiCallerName || "Alex",
      aiCallerCompany: initial.aiCallerCompany,
      aiSystemPrompt: initial.aiSystemPrompt,
    },
  });

  const promptLen = watch("aiSystemPrompt")?.length ?? 0;

  function onSubmit(values: FormData) {
    setServerError(null);
    startTransition(async () => {
      try {
        await saveBusinessProfile(values);
        onComplete();
      } catch (err) {
        setServerError(
          err instanceof Error
            ? err.message
            : "Could not save your details. Please try again."
        );
      }
    });
  }

  const inputClass =
    "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-navy-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:!border-white/10 dark:!bg-navy-800 dark:text-white";
  const labelClass =
    "mb-1.5 block text-sm font-medium text-navy-700 dark:text-white";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Tell our AI how to introduce itself and what to ask. You can refine
        these details any time from Settings.
      </p>

      <div>
        <label className={labelClass}>Your AI caller&apos;s name</label>
        <input
          type="text"
          maxLength={50}
          className={inputClass}
          placeholder="Alex"
          {...register("aiCallerName")}
        />
        {errors.aiCallerName ? (
          <p className="mt-1 text-xs text-red-500">{errors.aiCallerName.message}</p>
        ) : null}
      </div>

      <div>
        <label className={labelClass}>Your company name</label>
        <input
          type="text"
          maxLength={100}
          className={inputClass}
          placeholder="Acme Corp"
          {...register("aiCallerCompany")}
        />
        {errors.aiCallerCompany ? (
          <p className="mt-1 text-xs text-red-500">
            {errors.aiCallerCompany.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className={labelClass}>What should the AI say about your offer?</label>
        <textarea
          rows={5}
          maxLength={5000}
          className={`${inputClass} h-auto resize-y py-3`}
          placeholder={`We help small businesses get more clients with AI-powered calling.\nOur typical customer sees a 30% increase in booked appointments.\nThe goal is to book a 15-minute discovery call.`}
          {...register("aiSystemPrompt")}
        />
        <div className="mt-1 flex items-center justify-between">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Tell our AI how to introduce itself and what to ask. Minimum 50 characters.
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {promptLen}/5000
          </p>
        </div>
        {errors.aiSystemPrompt ? (
          <p className="mt-1 text-xs text-red-500">
            {errors.aiSystemPrompt.message}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
          {serverError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="linear flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 dark:bg-brand-400 dark:hover:bg-brand-300"
      >
        {pending ? (
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
        ) : null}
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
