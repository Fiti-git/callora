import { getApiKeys } from "@/app/actions/settings";
import { getAiCallerSettings } from "@/app/actions/ai-caller";
import { fetchWithAuth } from "@/lib/api";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SettingsForm from "@/components/settings-form";
import VapiSyncCard from "@/components/vapi-sync-card";
import { TeamManager } from "@/components/team-manager";
import { AiCallerForm } from "@/components/ai-caller-form";
import Card from "@/horizon-ui/components/card";

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
    <div>
      <div className="mt-3">
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Configure API keys, AI caller persona, and team access.
        </p>
      </div>

      <div className="mt-5 max-w-3xl space-y-5">
        <Card extra="p-0">
          <div className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              AI Caller
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Configure how your AI caller introduces itself on outbound calls.
            </p>
          </div>
          <div className="px-6 py-5">
            <AiCallerForm initial={aiCaller} />
          </div>
        </Card>

        <Card extra="p-0">
          <div className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              API Configuration
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Keys are stored securely per organisation and never exposed in the UI.
            </p>
          </div>
          <div className="px-6 py-5">
            <SettingsForm keys={keys} />
          </div>
        </Card>

        <VapiSyncCard />

        {isAdmin ? (
          <Card extra="p-0">
            <div className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Team
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Admins manage everything, Members create and edit, Viewers have
                read-only access.
              </p>
            </div>
            <div className="px-6 py-5">
              <TeamManager
                team={team}
                currentUserId={session?.user?.id || ""}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
