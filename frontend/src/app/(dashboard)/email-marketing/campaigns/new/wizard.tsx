"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/components/ui/toast";
import {
  createCampaign,
  updateCampaign,
  sendCampaign,
  scheduleCampaign,
  sendTestEmail,
} from "@/app/actions/email-marketing";

const MERGE_TAGS = ["{{firstName}}", "{{lastName}}", "{{company}}", "{{email}}"];

const setupSchema = z.object({
  name: z.string().min(1, "Required").max(200),
  fromName: z.string().min(1, "Required").max(200),
  fromEmail: z.string().email("Invalid email"),
  replyTo: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  subject: z.string().min(1, "Required").max(998),
  previewText: z.string().max(500).optional(),
});

type SetupValues = z.infer<typeof setupSchema>;

interface List {
  id: string;
  name: string;
  description?: string | null;
  memberCount?: number;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
}

interface Props {
  lists: List[];
  templates: Template[];
}

type Step = 1 | 2 | 3;

interface DraftState {
  campaignId: string | null;
  setup: SetupValues | null;
  htmlBody: string;
  textBody: string;
  selectedListIds: string[];
  scheduledAt: string;
  sendMode: "now" | "schedule";
}

export function CampaignWizard({ lists, templates }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<DraftState>({
    campaignId: null,
    setup: null,
    htmlBody: "<p>Hello {{firstName}},</p>\n<p>Write your message here.</p>",
    textBody: "",
    selectedListIds: [],
    scheduledAt: "",
    sendMode: "now",
  });
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">New Campaign</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Create and send an email campaign in 3 steps.
        </p>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <Step1Setup
          initial={draft.setup}
          submitting={submitting}
          onSubmit={async (values) => {
            setSubmitting(true);
            try {
              if (draft.campaignId) {
                await updateCampaign(draft.campaignId, {
                  name: values.name,
                  subject: values.subject,
                  previewText: values.previewText || null,
                  fromName: values.fromName,
                  fromEmail: values.fromEmail,
                  replyTo: values.replyTo || null,
                });
                setDraft((d) => ({ ...d, setup: values }));
              } else {
                const created = await createCampaign({
                  name: values.name,
                  subject: values.subject,
                  previewText: values.previewText || null,
                  fromName: values.fromName,
                  fromEmail: values.fromEmail,
                  replyTo: values.replyTo || null,
                  htmlBody: draft.htmlBody,
                  textBody: draft.textBody || null,
                });
                setDraft((d) => ({ ...d, campaignId: created.id, setup: values }));
              }
              setStep(2);
            } catch (err: any) {
              showToast("error", err?.message || "Failed to save");
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}

      {step === 2 && draft.campaignId && (
        <Step2Content
          campaignId={draft.campaignId}
          htmlBody={draft.htmlBody}
          textBody={draft.textBody}
          templates={templates}
          submitting={submitting}
          onBack={() => setStep(1)}
          onSubmit={async (htmlBody, textBody) => {
            setSubmitting(true);
            try {
              await updateCampaign(draft.campaignId!, {
                htmlBody,
                textBody: textBody || null,
              });
              setDraft((d) => ({ ...d, htmlBody, textBody }));
              setStep(3);
            } catch (err: any) {
              showToast("error", err?.message || "Failed to save content");
            } finally {
              setSubmitting(false);
            }
          }}
          onLoadTemplate={(t) => {
            setDraft((d) => ({
              ...d,
              htmlBody: t.htmlBody,
              textBody: t.textBody ?? "",
            }));
            showToast("success", `Loaded "${t.name}"`);
          }}
        />
      )}

      {step === 3 && draft.campaignId && (
        <Step3Recipients
          lists={lists}
          selectedListIds={draft.selectedListIds}
          scheduledAt={draft.scheduledAt}
          sendMode={draft.sendMode}
          submitting={submitting}
          onBack={() => setStep(2)}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onSubmit={async () => {
            if (!draft.selectedListIds.length) {
              showToast("error", "Select at least one list");
              return;
            }
            setSubmitting(true);
            try {
              await updateCampaign(draft.campaignId!, {
                listIds: draft.selectedListIds,
              });
              if (draft.sendMode === "now") {
                await sendCampaign(draft.campaignId!);
                showToast("success", "Campaign sending");
              } else {
                if (!draft.scheduledAt) {
                  showToast("error", "Pick a date/time");
                  setSubmitting(false);
                  return;
                }
                await scheduleCampaign(
                  draft.campaignId!,
                  new Date(draft.scheduledAt).toISOString()
                );
                showToast("success", "Campaign scheduled");
              }
              router.push(`/email-marketing/campaigns/${draft.campaignId}`);
            } catch (err: any) {
              const msg = err?.message || "Failed to send";
              if (msg.includes("invalid_status") || msg.includes("409")) {
                showToast(
                  "error",
                  "Campaign is already sending/sent. Refresh to see status."
                );
              } else {
                showToast("error", msg);
              }
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = ["Setup", "Content", "Recipients"];
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const idx = (i + 1) as Step;
        const active = step === idx;
        const done = step > idx;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                done
                  ? "bg-blue-600 text-white"
                  : active
                  ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              }`}
            >
              {idx}
            </span>
            <span
              className={`text-sm font-medium ${
                active
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <span className="w-8 h-px bg-gray-300 dark:bg-gray-700 mx-2" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------- Step 1 ----------------

function Step1Setup({
  initial,
  submitting,
  onSubmit,
}: {
  initial: SetupValues | null;
  submitting: boolean;
  onSubmit: (values: SetupValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: initial ?? undefined,
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4"
    >
      <Field label="Campaign name" error={errors.name?.message}>
        <input
          {...register("name")}
          className={inputClass}
          placeholder="Q4 Newsletter"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="From name" error={errors.fromName?.message}>
          <input {...register("fromName")} className={inputClass} placeholder="Acme Sales" />
        </Field>
        <Field label="From email" error={errors.fromEmail?.message}>
          <input {...register("fromEmail")} className={inputClass} placeholder="hello@acme.com" />
        </Field>
      </div>
      <Field label="Reply-to (optional)" error={errors.replyTo?.message}>
        <input {...register("replyTo")} className={inputClass} placeholder="reply@acme.com" />
      </Field>
      <Field label="Subject" error={errors.subject?.message}>
        <input
          {...register("subject")}
          className={inputClass}
          placeholder="Hello {{firstName}}, an update from Acme"
        />
      </Field>
      <Field label="Preview text (optional)" error={errors.previewText?.message}>
        <input
          {...register("previewText")}
          className={inputClass}
          placeholder="A short preview shown in the inbox..."
        />
      </Field>
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Next: Content"}
        </button>
      </div>
    </form>
  );
}

// ---------------- Step 2 ----------------

function Step2Content({
  campaignId,
  htmlBody: initialHtml,
  textBody: initialText,
  templates,
  submitting,
  onBack,
  onSubmit,
  onLoadTemplate,
}: {
  campaignId: string;
  htmlBody: string;
  textBody: string;
  templates: Template[];
  submitting: boolean;
  onBack: () => void;
  onSubmit: (htmlBody: string, textBody: string) => void;
  onLoadTemplate: (t: Template) => void;
}) {
  const [html, setHtml] = useState(initialHtml);
  const [text, setText] = useState(initialText);
  const [testRecipient, setTestRecipient] = useState("");
  const [testSending, setTestSending] = useState(false);
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);
  const { showToast } = useToast();

  function insertTag(tag: string) {
    const el = htmlRef.current;
    if (!el) {
      setHtml((h) => h + tag);
      return;
    }
    const start = el.selectionStart ?? html.length;
    const end = el.selectionEnd ?? html.length;
    const next = html.slice(0, start) + tag + html.slice(end);
    setHtml(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + tag.length;
    });
  }

  async function onTestSend() {
    if (!testRecipient) {
      showToast("error", "Enter a test recipient email");
      return;
    }
    setTestSending(true);
    try {
      // Persist current draft so the backend renders the latest body.
      await updateCampaign(campaignId, { htmlBody: html, textBody: text || null });
      await sendTestEmail(campaignId, testRecipient);
      showToast("success", `Test email sent to ${testRecipient}`);
    } catch (err: any) {
      showToast("error", err?.message || "Test send failed");
    } finally {
      setTestSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
        <select
          onChange={(e) => {
            const id = e.target.value;
            const t = templates.find((x) => x.id === id);
            if (t) {
              onLoadTemplate(t);
              setHtml(t.htmlBody);
              setText(t.textBody ?? "");
            }
            e.target.value = "";
          }}
          className={`${inputClass} max-w-xs`}
        >
          <option value="">Load template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          onChange={(e) => {
            if (e.target.value) {
              insertTag(e.target.value);
              e.target.value = "";
            }
          }}
          className={`${inputClass} max-w-xs`}
        >
          <option value="">Insert merge tag…</option>
          {MERGE_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <input
          type="email"
          value={testRecipient}
          onChange={(e) => setTestRecipient(e.target.value)}
          placeholder="test@example.com"
          className={`${inputClass} max-w-xs`}
        />
        <button
          type="button"
          onClick={onTestSend}
          disabled={testSending}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {testSending ? "Sending…" : "Test send"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              HTML body
            </label>
            <textarea
              ref={htmlRef}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={18}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              Plain text body (optional)
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
            Preview
          </label>
          <iframe
            title="Email preview"
            sandbox="allow-same-origin"
            srcDoc={html}
            className="w-full h-[640px] bg-white border border-gray-200 dark:border-gray-800 rounded-lg"
          />
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Back
        </button>
        <button
          onClick={() => onSubmit(html, text)}
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Next: Recipients"}
        </button>
      </div>
    </div>
  );
}

// ---------------- Step 3 ----------------

function Step3Recipients({
  lists,
  selectedListIds,
  scheduledAt,
  sendMode,
  submitting,
  onBack,
  onChange,
  onSubmit,
}: {
  lists: List[];
  selectedListIds: string[];
  scheduledAt: string;
  sendMode: "now" | "schedule";
  submitting: boolean;
  onBack: () => void;
  onChange: (patch: Partial<DraftState>) => void;
  onSubmit: () => void;
}) {
  const estimatedReach = lists
    .filter((l) => selectedListIds.includes(l.id))
    .reduce((acc, l) => acc + (l.memberCount ?? 0), 0);

  function toggleList(id: string) {
    if (selectedListIds.includes(id)) {
      onChange({ selectedListIds: selectedListIds.filter((x) => x !== id) });
    } else {
      onChange({ selectedListIds: [...selectedListIds, id] });
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Recipient lists</h3>
        {lists.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No lists yet. Create one first.
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {lists.map((l) => (
              <label
                key={l.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30"
              >
                <input
                  type="checkbox"
                  checked={selectedListIds.includes(l.id)}
                  onChange={() => toggleList(l.id)}
                  className="rounded border-gray-300"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{l.name}</p>
                  {l.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {l.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {(l.memberCount ?? 0).toLocaleString()} members
                </span>
              </label>
            ))}
          </div>
        )}
        {selectedListIds.length > 0 && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Estimated reach: {estimatedReach.toLocaleString()} (may be lower after dedupe)
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Send</h3>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="sendMode"
              checked={sendMode === "now"}
              onChange={() => onChange({ sendMode: "now" })}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Send now</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="sendMode"
              checked={sendMode === "schedule"}
              onChange={() => onChange({ sendMode: "schedule" })}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Schedule</span>
          </label>
        </div>
        {sendMode === "schedule" && (
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onChange({ scheduledAt: e.target.value })}
            className={`${inputClass} mt-3 max-w-xs`}
          />
        )}
      </div>

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || selectedListIds.length === 0}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting
            ? "Working…"
            : sendMode === "now"
            ? "Send campaign"
            : "Schedule campaign"}
        </button>
      </div>
    </div>
  );
}

// ---------------- Shared ----------------

const inputClass =
  "block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
