import { getAiCallerSettings } from "@/app/actions/ai-caller";
import { AiCallerForm } from "@/components/ai-caller-form";
import Card from "@/horizon-ui/components/card";

export default async function SettingsPage() {
  const aiCaller = await getAiCallerSettings().catch(() => ({
    aiCallerName: "Alex",
    aiCallerCompany: "",
    aiCallerPhone: "",
    aiSystemPrompt: null,
  }));

  // Outbound number is now managed by the platform — show a read-only label
  // rather than letting tenants edit it. The platform-level Vapi phone is
  // configured server-side via env.
  const platformOutboundNumber = aiCaller.aiCallerPhone || "Managed by Callora";

  return (
    <div>
      <div className="mt-3">
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Configure your AI caller persona.
        </p>
      </div>

      <div className="mt-5 max-w-3xl space-y-5">
        <Card extra="p-0">
          <div className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              AI Caller Persona
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Configure how your AI caller introduces itself on outbound calls.
            </p>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div className="rounded-xl border border-gray-200 bg-lightPrimary px-4 py-3 dark:border-white/10 dark:bg-navy-900/40">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Outbound Number
              </div>
              <div className="mt-1 text-sm font-medium text-navy-700 dark:text-white">
                {platformOutboundNumber}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Outbound calls are placed from a Callora-managed number. To use
                a custom number, contact support.
              </p>
            </div>

            <AiCallerForm initial={aiCaller} />
          </div>
        </Card>
      </div>
    </div>
  );
}
