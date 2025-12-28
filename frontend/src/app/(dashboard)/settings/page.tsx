import { getApiKeys } from "@/app/actions/settings";
import SettingsForm from "@/components/settings-form";

export default async function SettingsPage() {
  const keys = await getApiKeys();

  return (
    <div className="max-w-2xl bg-white p-8 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Organization Settings</h2>
      <p className="mb-4 text-sm text-gray-500">
        Configure your API keys to enable the agent capabilities.
      </p>

      <SettingsForm keys={keys} />
    </div>
  );
}
