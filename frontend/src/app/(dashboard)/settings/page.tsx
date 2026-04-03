import { getApiKeys } from "@/app/actions/settings";
import SettingsForm from "@/components/settings-form";

export default async function SettingsPage() {
  const keys = await getApiKeys();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure API keys to enable AI lead generation and outbound calling.
        </p>
      </div>

      <div className="max-w-2xl">
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900">API Configuration</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Keys are stored securely per organisation and never exposed in the UI.
            </p>
          </div>
          <div className="px-6 py-5">
            <SettingsForm keys={keys} />
          </div>
        </div>
      </div>
    </div>
  );
}
