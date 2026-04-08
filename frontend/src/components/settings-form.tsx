"use client";

import { updateApiKeys } from "@/app/actions/settings";
import { useFormStatus } from "react-dom";
import toast from "react-hot-toast";

export default function SettingsForm({ keys }: { keys: any }) {
  async function handleSubmit(formData: FormData) {
    try {
      await updateApiKeys(formData);
      toast.success("Settings saved.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save settings.");
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <FormGroup
        label="Google Maps API Key"
        name="googleMapsKey"
        defaultValue={keys?.googleMapsKey}
        description="Used to search for businesses in your target area."
        type="password"
      />
      <FormGroup
        label="Gemini API Key"
        name="geminiKey"
        defaultValue={keys?.geminiKey}
        description="Used to generate search queries and qualify leads."
        type="password"
      />
      <FormGroup
        label="Vapi Private Key"
        name="vapiKey"
        defaultValue={keys?.vapiKey}
        description="Used to initiate AI-powered outbound phone calls."
        type="password"
      />
      <FormGroup
        label="Vapi Phone Number ID"
        name="vapiPhoneId"
        defaultValue={keys?.vapiPhoneId}
        description="The Vapi phone number ID used as the caller."
      />

      <div className="pt-2">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
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
        "Save Changes"
      )}
    </button>
  );
}

function FormGroup({
  label,
  name,
  defaultValue,
  description,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  description?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {description && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
      )}
      <input
        type={type}
        name={name}
        defaultValue={defaultValue || ""}
        className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
