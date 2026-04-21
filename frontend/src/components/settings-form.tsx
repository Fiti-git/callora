"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { updateApiKeys, type KeyValidation } from "@/app/actions/settings";

interface KeysShape {
  googleMapsKey?: string | null;
  geminiKey?: string | null;
  vapiKey?: string | null;
  vapiPhoneId?: string | null;
}

type FieldName = "googleMapsKey" | "geminiKey" | "vapiKey" | "vapiPhoneId";

type ValidationMap = {
  googleMaps: KeyValidation | null;
  gemini: KeyValidation | null;
  vapi: KeyValidation | null;
};

function maskKey(key: string | null | undefined): string {
  if (!key) return "";
  return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + key.slice(-4);
}

export default function SettingsForm({ keys }: { keys: KeysShape }) {
  // Which keys are the original masked values (unchanged by user)
  const [editing, setEditing] = useState<Record<FieldName, boolean>>({
    googleMapsKey: false,
    geminiKey: false,
    vapiKey: false,
    vapiPhoneId: false,
  });

  const [values, setValues] = useState<Record<FieldName, string>>({
    googleMapsKey: maskKey(keys?.googleMapsKey),
    geminiKey: maskKey(keys?.geminiKey),
    vapiKey: maskKey(keys?.vapiKey),
    vapiPhoneId: keys?.vapiPhoneId ?? "",
  });

  const [validation, setValidation] = useState<ValidationMap>({
    googleMaps: null,
    gemini: null,
    vapi: null,
  });
  const [saving, setSaving] = useState(false);

  function onFocus(field: FieldName) {
    if (!editing[field]) {
      setEditing((prev) => ({ ...prev, [field]: true }));
      setValues((prev) => ({ ...prev, [field]: "" }));
    }
  }

  function onChange(field: FieldName, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only send keys the user actually edited OR the plain vapiPhoneId field
      const payload: Record<FieldName, string> = {} as any;
      (["googleMapsKey", "geminiKey", "vapiKey"] as FieldName[]).forEach((f) => {
        if (editing[f]) payload[f] = values[f];
      });
      payload.vapiPhoneId = values.vapiPhoneId;

      const result = await updateApiKeys(payload);
      setValidation(result.validation);
      toast.success("Settings saved.");

      // Re-mask any keys the user just edited
      setEditing({
        googleMapsKey: false,
        geminiKey: false,
        vapiKey: false,
        vapiPhoneId: false,
      });
      setValues((prev) => ({
        googleMapsKey: editing.googleMapsKey && values.googleMapsKey
          ? maskKey(values.googleMapsKey)
          : prev.googleMapsKey,
        geminiKey: editing.geminiKey && values.geminiKey
          ? maskKey(values.geminiKey)
          : prev.geminiKey,
        vapiKey: editing.vapiKey && values.vapiKey
          ? maskKey(values.vapiKey)
          : prev.vapiKey,
        vapiPhoneId: prev.vapiPhoneId,
      }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormGroup
        label="Google Maps API Key"
        name="googleMapsKey"
        value={values.googleMapsKey}
        editing={editing.googleMapsKey}
        onFocus={() => onFocus("googleMapsKey")}
        onChange={(v) => onChange("googleMapsKey", v)}
        description="Used to search for businesses in your target area."
        validation={validation.googleMaps}
        masked
      />
      <FormGroup
        label="Gemini API Key"
        name="geminiKey"
        value={values.geminiKey}
        editing={editing.geminiKey}
        onFocus={() => onFocus("geminiKey")}
        onChange={(v) => onChange("geminiKey", v)}
        description="Used to generate search queries and qualify leads."
        validation={validation.gemini}
        masked
      />
      <FormGroup
        label="Vapi Private Key"
        name="vapiKey"
        value={values.vapiKey}
        editing={editing.vapiKey}
        onFocus={() => onFocus("vapiKey")}
        onChange={(v) => onChange("vapiKey", v)}
        description="Used to initiate AI-powered outbound phone calls."
        validation={validation.vapi}
        masked
      />
      <FormGroup
        label="Vapi Phone Number ID"
        name="vapiPhoneId"
        value={values.vapiPhoneId}
        editing
        onFocus={() => {}}
        onChange={(v) => onChange("vapiPhoneId", v)}
        description="The Vapi phone number ID used as the caller."
      />

      <div className="pt-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </form>
  );
}

function ValidationIndicator({ validation }: { validation: KeyValidation | null }) {
  if (!validation) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">&mdash;</span>;
  }
  if (validation.valid) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Valid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      {validation.error || "Invalid"}
    </span>
  );
}

function FormGroup({
  label,
  name,
  value,
  onChange,
  onFocus,
  editing,
  description,
  validation,
  masked,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  editing: boolean;
  description?: string;
  validation?: KeyValidation | null;
  masked?: boolean;
}) {
  const showEditIcon = masked && !editing && value.length > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        {validation !== undefined && <ValidationIndicator validation={validation ?? null} />}
      </div>
      {description && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
      )}
      <div className="relative">
        <input
          type={editing ? "text" : "text"}
          name={name}
          value={value}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 pr-10 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {showEditIcon && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
            aria-hidden="true"
            title="Click to edit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
