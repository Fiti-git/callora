"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useToast } from "@/components/ui/toast";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/app/actions/email-marketing";

interface Template {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  category?: string | null;
  createdAt: string;
}

const inputClass =
  "block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm";

export function TemplatesClient({ initial }: { initial: Template[] }) {
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const router = useRouter();
  const { showToast } = useToast();

  async function onDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await deleteTemplate(id);
      showToast("success", "Template deleted");
      router.refresh();
    } catch (err: any) {
      showToast("error", err?.message || "Failed to delete");
    }
  }

  const categories = Array.from(
    new Set(initial.map((t) => t.category).filter(Boolean) as string[])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Templates</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Reusable email content for campaigns and automations.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Template
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No templates yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {initial.map((t) => (
            <div
              key={t.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5"
            >
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {t.name}
              </h3>
              {t.category && (
                <span className="inline-block mt-1 text-[10px] uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded px-1.5 py-0.5">
                  {t.category}
                </span>
              )}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {t.subject}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-gray-400 dark:text-gray-500">
                  {format(new Date(t.createdAt), "MMM d, yyyy")}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditing(t)}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(t.id)}
                    className="font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateModal
          template={editing === "new" ? null : editing}
          existingCategories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TemplateModal({
  template,
  existingCategories,
  onClose,
}: {
  template: Template | null;
  existingCategories: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [htmlBody, setHtmlBody] = useState(template?.htmlBody ?? "");
  const [textBody, setTextBody] = useState(template?.textBody ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [customCategory, setCustomCategory] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!name || !subject || !htmlBody) {
      showToast("error", "Name, subject, and HTML are required");
      return;
    }
    setSaving(true);
    try {
      const finalCategory =
        category === "__new__" ? customCategory.trim() || null : category || null;
      const payload = {
        name,
        subject,
        htmlBody,
        textBody: textBody || null,
        category: finalCategory,
      };
      if (template) {
        await updateTemplate(template.id, payload);
        showToast("success", "Template updated");
      } else {
        await createTemplate(payload);
        showToast("success", "Template created");
      }
      onClose();
      router.refresh();
    } catch (err: any) {
      showToast("error", err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {template ? "Edit Template" : "New Template"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              Name
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            >
              <option value="">— None —</option>
              {existingCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__new__">Add new…</option>
            </select>
            {category === "__new__" && (
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="New category name"
                className={`${inputClass} mt-2`}
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              HTML body
            </label>
            <textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              rows={10}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              Plain text (optional)
            </label>
            <textarea
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              rows={4}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
