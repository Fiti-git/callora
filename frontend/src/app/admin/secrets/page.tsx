import { platformFetch } from "@/lib/platformApi";
import { SecretsForm } from "./SecretsForm";

interface SecretItem {
  key: string;
  group: "vapi" | "google" | "stripe" | "smtp" | "limits";
  label: string;
  description: string;
  required: boolean;
  cleartext: boolean;
  isSet: boolean;
  preview: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const GROUP_TITLES: Record<SecretItem["group"], string> = {
  vapi: "Vapi (Outbound Calling)",
  google: "Google (Maps + Gemini)",
  stripe: "Stripe (Billing)",
  smtp: "Email (SMTP)",
  limits: "Limits & Modes",
};

const GROUP_ORDER: SecretItem["group"][] = ["vapi", "google", "stripe", "smtp", "limits"];

export default async function SecretsPage() {
  const data: { items: SecretItem[] } = await platformFetch("/secrets");
  const grouped: Record<string, SecretItem[]> = {};
  for (const item of data.items) {
    (grouped[item.group] ||= []).push(item);
  }

  const missingRequired = data.items.filter((i) => i.required && !i.isSet);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Platform Secrets</h1>
        <p className="text-slate-400 text-sm">
          Vendor API keys and platform-wide settings. Values are AES-256-GCM encrypted at rest.
          Existing values are masked; saving a new value overwrites the old one.
        </p>
      </div>

      {missingRequired.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-700 rounded-xl p-4">
          <div className="font-semibold text-amber-300 mb-1">
            {missingRequired.length} required secret{missingRequired.length === 1 ? "" : "s"} not set
          </div>
          <div className="text-amber-200 text-sm">
            {missingRequired.map((m) => m.label).join(", ")}
          </div>
        </div>
      )}

      {GROUP_ORDER.map((group) => {
        const items = grouped[group];
        if (!items?.length) return null;
        return (
          <section key={group} className="bg-slate-900 rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-semibold">{GROUP_TITLES[group]}</h2>
            <SecretsForm items={items} />
          </section>
        );
      })}
    </div>
  );
}
