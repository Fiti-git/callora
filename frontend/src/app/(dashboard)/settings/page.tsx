import { getApiKeys, updateApiKeys } from "@/app/actions/settings";
import { revalidatePath } from "next/cache";

export default async function SettingsPage() {
  const keys = await getApiKeys();

  async function save(formData: FormData) {
    "use server";
    const data = {
      googleMapsKey: formData.get("googleMapsKey") as string,
      geminiKey: formData.get("geminiKey") as string,
      vapiKey: formData.get("vapiKey") as string,
      vapiPhoneId: formData.get("vapiPhoneId") as string,
    };
    await updateApiKeys(data);
    revalidatePath("/settings");
  }

  return (
    <div className="max-w-2xl bg-white p-8 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Organization Settings</h2>
      <p className="mb-4 text-sm text-gray-500">
        Configure your API keys to enable the agent capabilities.
      </p>

      <form action={save} className="space-y-4">
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
          <button
            type="submit"
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            Save Configuration
          </button>
        </div>
      </form>
    </div>
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
