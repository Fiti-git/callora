"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  AiCallerSettings,
  updateAiCallerSettings,
} from "@/app/actions/ai-caller";

interface AiCallerFormProps {
  initial: AiCallerSettings;
}

function buildPreviewPrompt(values: {
  aiCallerName: string;
  aiCallerCompany: string;
  aiCallerPhone: string;
  aiSystemPrompt: string;
}): string {
  if (values.aiSystemPrompt.trim().length > 0) {
    return values.aiSystemPrompt;
  }
  const name = values.aiCallerName.trim() || "Alex";
  const company = values.aiCallerCompany.trim() || "your company";
  const contactLine = values.aiCallerPhone.trim()
    ? ` If anyone asks for a contact number, provide: ${values.aiCallerPhone.trim()}.`
    : "";
  return `You are ${name} from ${company}. Your goal is to see if the business owner is interested in getting more clients via AI automation. Be professional, concise, and friendly. If they are interested, ask for an email to send details. If they are busy, offer to call back later.${contactLine}`;
}

export function AiCallerForm({ initial }: AiCallerFormProps) {
  const [aiCallerName, setAiCallerName] = useState(initial.aiCallerName ?? "");
  const [aiCallerCompany, setAiCallerCompany] = useState(
    initial.aiCallerCompany ?? ""
  );
  const [aiCallerPhone, setAiCallerPhone] = useState(initial.aiCallerPhone ?? "");
  const [aiSystemPrompt, setAiSystemPrompt] = useState(
    initial.aiSystemPrompt ?? ""
  );
  const [pending, startTransition] = useTransition();

  const preview = buildPreviewPrompt({
    aiCallerName,
    aiCallerCompany,
    aiCallerPhone,
    aiSystemPrompt,
  });
  const usingCustom = aiSystemPrompt.trim().length > 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateAiCallerSettings({
          aiCallerName: aiCallerName.trim(),
          aiCallerCompany: aiCallerCompany.trim(),
          aiCallerPhone: aiCallerPhone.trim(),
          aiSystemPrompt: aiSystemPrompt.trim().length > 0 ? aiSystemPrompt.trim() : null,
        });
        toast.success("AI caller settings saved.");
      } catch (err: unknown) {
        toast.error(
          "Failed to save: " +
            (err instanceof Error ? err.message : "Unknown error")
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field
        label="Caller Name"
        description="Your AI caller's first name"
      >
        <input
          type="text"
          value={aiCallerName}
          onChange={(e) => setAiCallerName(e.target.value)}
          placeholder="Alex"
          maxLength={50}
          className={inputClass}
        />
      </Field>

      <Field
        label="Company Name"
        description="Company the AI represents"
      >
        <input
          type="text"
          value={aiCallerCompany}
          onChange={(e) => setAiCallerCompany(e.target.value)}
          placeholder="Acme Corp"
          maxLength={100}
          className={inputClass}
        />
      </Field>

      <Field
        label="Contact Phone"
        description="Phone number shared if prospect asks (optional)"
      >
        <input
          type="text"
          value={aiCallerPhone}
          onChange={(e) => setAiCallerPhone(e.target.value)}
          placeholder="+1 416 555 0100"
          className={inputClass}
        />
      </Field>

      <Field
        label="Custom Script"
        description="Leave blank to use the default script generated from your settings above."
      >
        <textarea
          rows={6}
          value={aiSystemPrompt}
          onChange={(e) => setAiSystemPrompt(e.target.value)}
          placeholder="Leave blank to use the default script. Or write your own: 'You are [Name] from [Company]...'"
          maxLength={2000}
          className={`${inputClass} resize-y font-mono`}
        />
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          {aiSystemPrompt.length}/2000 characters
        </p>
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Prompt Preview
          </p>
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ${
              usingCustom
                ? "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30"
                : "bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
            }`}
          >
            {usingCustom ? "Custom" : "Auto-generated"}
          </span>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
          {preview}
        </div>
      </div>

      <div className="pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {pending ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </>
          ) : (
            "Save AI Caller"
          )}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {description && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
      )}
      {children}
    </div>
  );
}
