"use client";

import { updateApiKeys } from "@/app/actions/settings";
import toast from "react-hot-toast";

export default function SettingsForm({ keys }: { keys: any }) {
  async function handleSubmit(formData: FormData) {
    try {
      await updateApiKeys(formData); // This is a server action
      toast.success("Settings saved successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save settings.");
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <FormGroup
        label="Google Maps API Key"
        name="googleMapsKey"
        defaultValue={keys?.googleMapsKey}
        type="password"
      />
      <FormGroup
        label="Gemini API Key"
        name="geminiKey"
        defaultValue={keys?.geminiKey}
        type="password"
      />
      <FormGroup
        label="Vapi Private Key"
        name="vapiKey"
        defaultValue={keys?.vapiKey}
        type="password"
      />
      <FormGroup
        label="Vapi Phone Number ID"
        name="vapiPhoneId"
        defaultValue={keys?.vapiPhoneId}
      />

      <div className="pt-4">
        <Button />
      </div>
    </form>
  );
}

import { useFormStatus } from "react-dom";

function Button() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : "Save Configuration"}
    </button>
  );
}

function FormGroup({ label, name, defaultValue, type = "text" }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue || ""}
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:border-indigo-500 focus:ring-indigo-500"
      />
    </div>
  );
}
