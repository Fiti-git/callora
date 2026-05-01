import { getAiCallerSettings } from "@/app/actions/ai-caller";
import { AiCallerForm } from "@/components/ai-caller-form";
import Card from "@/horizon-ui/components/card";
import PhoneNumberCard from "@/components/phone-number-card";
import SpendCapCard from "@/components/spend-cap-card";

export default async function SettingsPage() {
  const aiCaller = await getAiCallerSettings().catch(() => ({
    aiCallerName: "Alex",
    aiCallerCompany: "",
    aiCallerPhone: "",
    aiSystemPrompt: null,
  }));

  return (
    <div>
      <div className="mt-3">
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your AI caller, phone number, and spend caps.
        </p>
      </div>

      <div className="mt-5 max-w-3xl space-y-5">
        <PhoneNumberCard />

        <SpendCapCard />

        <Card extra="p-0">
          <div className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              AI Caller Persona
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Configure how your AI caller introduces itself on outbound calls.
            </p>
          </div>
          <div className="space-y-5 px-6 py-5">
            <AiCallerForm initial={aiCaller} />
          </div>
        </Card>
      </div>
    </div>
  );
}
