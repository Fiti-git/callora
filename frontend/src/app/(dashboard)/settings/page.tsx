import { getApiKeys } from "@/app/actions/settings";
import { getAiCallerSettings } from "@/app/actions/ai-caller";
import { fetchWithAuth } from "@/lib/api";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SettingsForm from "@/components/settings-form";
import VapiSyncCard from "@/components/vapi-sync-card";
import { TeamManager } from "@/components/team-manager";
import { AiCallerForm } from "@/components/ai-caller-form";

export default async function SettingsPage() {
  const [keys, session, aiCaller] = await Promise.all([
    getApiKeys(),
    getServerSession(authOptions),
    getAiCallerSettings().catch(() => ({
      aiCallerName: "Alex",
      aiCallerCompany: "",
      aiCallerPhone: "",
      aiSystemPrompt: null,
    })),
  ]);

  const isAdmin = session?.user?.role === "ADMIN";
  let team: any[] = [];
  if (isAdmin) {
    try {
      team = await fetchWithAuth("/settings/team");
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure API keys to enable AI lead generation and outbound calling.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">AI Caller</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Configure how your AI caller introduces itself on outbound calls.
            </p>
          </div>
          <div className="px-6 py-5">
            <AiCallerForm initial={aiCaller} />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">API Configuration</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Keys are stored securely per organisation and never exposed in the UI.
            </p>
          </div>
          <div className="px-6 py-5">
            <SettingsForm keys={keys} />
          </div>
        </div>

        <VapiSyncCard />

        {isAdmin && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
            <div className="px-6 py-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Team</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Manage team member roles. Admins can manage everything, Members can create and edit,
                Viewers have read-only access.
              </p>
            </div>
            <div className="px-6 py-5">
              <TeamManager team={team} currentUserId={session?.user?.id || ""} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
