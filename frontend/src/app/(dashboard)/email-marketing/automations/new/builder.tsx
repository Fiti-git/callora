"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { createAutomation } from "@/app/actions/email-marketing";

const TRIGGERS = [
  "LEAD_QUALIFIED",
  "DEAL_WON",
  "CONTACT_CREATED",
  "CAMPAIGN_COMPLETE",
] as const;

type Step =
  | { kind: "WAIT"; days: number }
  | { kind: "SEND_EMAIL"; templateId: string; subjectOverride?: string }
  | {
      kind: "BRANCH";
      condition: { field: string; op: "="; value: string };
      ifTrue: number;
      ifFalse: number;
    };

interface Template {
  id: string;
  name: string;
}

const inputClass =
  "block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm";

function defaultStep(kind: Step["kind"]): Step {
  if (kind === "WAIT") return { kind: "WAIT", days: 1 };
  if (kind === "SEND_EMAIL") return { kind: "SEND_EMAIL", templateId: "" };
  return {
    kind: "BRANCH",
    condition: { field: "", op: "=", value: "" },
    ifTrue: 0,
    ifFalse: 0,
  };
}

function validateLocally(steps: Step[]): string | null {
  if (steps.length === 0) return "Add at least one step";
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === "SEND_EMAIL" && !s.templateId) return `Step ${i + 1}: pick a template`;
    if (s.kind === "WAIT" && (!Number.isFinite(s.days) || s.days < 0))
      return `Step ${i + 1}: days must be ≥ 0`;
    if (s.kind === "BRANCH") {
      if (s.ifTrue < 0 || s.ifTrue >= steps.length || s.ifFalse < 0 || s.ifFalse >= steps.length)
        return `Step ${i + 1}: branch targets out of range`;
      if (s.ifTrue === i || s.ifFalse === i) return `Step ${i + 1}: branch cannot point to itself`;
    }
  }
  return null;
}

export function AutomationBuilder({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<(typeof TRIGGERS)[number]>("LEAD_QUALIFIED");
  const [steps, setSteps] = useState<Step[]>([{ kind: "WAIT", days: 1 }]);
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);

  function addStep(at: number, kind: Step["kind"]) {
    const next = [...steps];
    next.splice(at, 0, defaultStep(kind));
    setSteps(next);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? ({ ...s, ...patch } as Step) : s))
    );
  }

  async function onSave() {
    if (!name.trim()) {
      showToast("error", "Enter a name");
      return;
    }
    const issue = validateLocally(steps);
    if (issue) {
      showToast("error", issue);
      return;
    }
    setSaving(true);
    try {
      await createAutomation({
        name: name.trim(),
        trigger,
        active,
        sequence: steps,
      });
      showToast("success", "Automation created");
      router.push("/email-marketing/automations");
    } catch (err: any) {
      const msg = err?.message || "Failed to save";
      if (msg.includes("invalid_sequence")) {
        showToast("error", "Sequence is invalid (server check)");
      } else {
        showToast("error", msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">New Automation</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Build a trigger-based sequence.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
            Name
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
            Trigger
          </label>
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as any)}
            className={inputClass}
          >
            {TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Activate immediately</span>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sequence</h2>
        </div>
        {steps.map((s, idx) => (
          <div key={idx} className="space-y-2">
            <StepCard
              index={idx}
              step={s}
              templates={templates}
              totalSteps={steps.length}
              onChange={(patch) => updateStep(idx, patch)}
              onRemove={() => removeStep(idx)}
            />
            <AddStepBetween onAdd={(k) => addStep(idx + 1, k)} />
          </div>
        ))}
        {steps.length === 0 && <AddStepBetween onAdd={(k) => addStep(0, k)} />}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save automation"}
        </button>
      </div>
    </div>
  );
}

function AddStepBetween({ onAdd }: { onAdd: (kind: Step["kind"]) => void }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      <button
        onClick={() => onAdd("WAIT")}
        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        + Wait
      </button>
      <button
        onClick={() => onAdd("SEND_EMAIL")}
        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        + Send Email
      </button>
      <button
        onClick={() => onAdd("BRANCH")}
        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        + Branch
      </button>
    </div>
  );
}

function StepCard({
  index,
  step,
  templates,
  totalSteps,
  onChange,
  onRemove,
}: {
  index: number;
  step: Step;
  templates: Template[];
  totalSteps: number;
  onChange: (patch: Partial<Step>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Step {index + 1} ·{" "}
          <span className="font-normal text-gray-500 dark:text-gray-400">{step.kind}</span>
        </h3>
        <button
          onClick={onRemove}
          className="text-xs text-red-600 hover:underline"
        >
          Remove
        </button>
      </div>
      {step.kind === "WAIT" && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Days
          </label>
          <input
            type="number"
            min={0}
            value={step.days}
            onChange={(e) => onChange({ days: Number(e.target.value) } as Partial<Step>)}
            className={`${inputClass} max-w-[160px]`}
          />
        </div>
      )}
      {step.kind === "SEND_EMAIL" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Template
            </label>
            <select
              value={step.templateId}
              onChange={(e) => onChange({ templateId: e.target.value } as Partial<Step>)}
              className={inputClass}
            >
              <option value="">— Select —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Subject override (optional)
            </label>
            <input
              value={step.subjectOverride ?? ""}
              onChange={(e) =>
                onChange({ subjectOverride: e.target.value || undefined } as Partial<Step>)
              }
              className={inputClass}
            />
          </div>
        </div>
      )}
      {step.kind === "BRANCH" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Field
              </label>
              <input
                value={step.condition.field}
                onChange={(e) =>
                  onChange({
                    condition: { ...step.condition, field: e.target.value },
                  } as Partial<Step>)
                }
                className={inputClass}
                placeholder="e.g. lead.industry"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Op
              </label>
              <input value="=" disabled className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Value
              </label>
              <input
                value={step.condition.value}
                onChange={(e) =>
                  onChange({
                    condition: { ...step.condition, value: e.target.value },
                  } as Partial<Step>)
                }
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                If true → step
              </label>
              <select
                value={step.ifTrue}
                onChange={(e) => onChange({ ifTrue: Number(e.target.value) } as Partial<Step>)}
                className={inputClass}
              >
                {Array.from({ length: totalSteps }, (_, i) => (
                  <option key={i} value={i}>
                    Step {i + 1}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                If false → step
              </label>
              <select
                value={step.ifFalse}
                onChange={(e) => onChange({ ifFalse: Number(e.target.value) } as Partial<Step>)}
                className={inputClass}
              >
                {Array.from({ length: totalSteps }, (_, i) => (
                  <option key={i} value={i}>
                    Step {i + 1}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
