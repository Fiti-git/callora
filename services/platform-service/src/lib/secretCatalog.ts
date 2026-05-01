// Catalog of secrets manageable from the admin UI. Keys NOT in this list
// are rejected by the PUT endpoint to prevent arbitrary writes.
// Bootstrap secrets (DATABASE_URL, NEXTAUTH_SECRET, PLATFORM_JWT_SECRET,
// SECRETS_ENCRYPTION_KEY, REDIS_URL) are intentionally excluded — they must
// stay in the host environment.

export type SecretGroup = "vapi" | "google" | "stripe" | "smtp" | "limits";

export interface SecretMeta {
  key: string;
  group: SecretGroup;
  label: string;
  description: string;
  required: boolean;
  /** If true, value is non-sensitive (price ID, meter ID) — show in clear. */
  cleartext?: boolean;
}

export const SECRET_CATALOG: SecretMeta[] = [
  // ---- Vapi ------------------------------------------------------------
  { key: "VAPI_PRIVATE_KEY", group: "vapi", label: "Vapi Private Key", description: "Server-side API key from Vapi dashboard.", required: true },
  { key: "VAPI_PHONE_NUMBER_ID", group: "vapi", label: "Vapi Trial Number ID", description: "Shared trial-pool number ID (used during 14-day trial).", required: true, cleartext: true },
  { key: "VAPI_WEBHOOK_SECRET", group: "vapi", label: "Vapi Webhook Secret", description: "Used to verify inbound webhooks from Vapi.", required: true },

  // ---- Google ----------------------------------------------------------
  { key: "GOOGLE_MAPS_API_KEY", group: "google", label: "Google Maps API Key", description: "For Places API lead discovery.", required: true },
  { key: "GEMINI_API_KEY", group: "google", label: "Gemini API Key", description: "For lead qualification + call summary.", required: true },

  // ---- Stripe ----------------------------------------------------------
  { key: "STRIPE_SECRET_KEY", group: "stripe", label: "Stripe Secret Key", description: "Live mode sk_live_… key.", required: true },
  { key: "STRIPE_WEBHOOK_SECRET", group: "stripe", label: "Stripe Webhook Secret", description: "Signing secret for /api/billing/webhook.", required: true },
  { key: "STRIPE_PRICE_FREE", group: "stripe", label: "Free Plan Price ID", description: "Stripe price ID for FREE tier.", required: false, cleartext: true },
  { key: "STRIPE_PRICE_STARTER", group: "stripe", label: "Starter Plan Price ID", description: "Stripe price ID for STARTER tier.", required: true, cleartext: true },
  { key: "STRIPE_PRICE_PRO", group: "stripe", label: "Pro Plan Price ID", description: "Stripe price ID for PRO tier.", required: true, cleartext: true },
  { key: "STRIPE_PRICE_ENTERPRISE", group: "stripe", label: "Enterprise Plan Price ID", description: "Stripe price ID for ENTERPRISE tier.", required: false, cleartext: true },
  { key: "STRIPE_METER_CALL_MINUTES", group: "stripe", label: "Meter: Call Minutes", description: "Stripe metered-billing meter ID.", required: true, cleartext: true },
  { key: "STRIPE_METER_LEADS_QUALIFIED", group: "stripe", label: "Meter: Leads Qualified", description: "Stripe metered-billing meter ID.", required: true, cleartext: true },
  { key: "STRIPE_METER_NUMBER_RENTAL", group: "stripe", label: "Meter: Number Rental", description: "Stripe metered-billing meter ID.", required: true, cleartext: true },

  // ---- SMTP ------------------------------------------------------------
  { key: "SMTP_HOST", group: "smtp", label: "SMTP Host", description: "e.g. smtp.resend.com", required: true, cleartext: true },
  { key: "SMTP_PORT", group: "smtp", label: "SMTP Port", description: "Usually 465 (TLS) or 587.", required: true, cleartext: true },
  { key: "SMTP_USER", group: "smtp", label: "SMTP User", description: "For Resend, this is literally 'resend'.", required: true, cleartext: true },
  { key: "SMTP_PASS", group: "smtp", label: "SMTP Password / API Key", description: "For Resend, your re_… API key.", required: true },
  { key: "SMTP_FROM", group: "smtp", label: "SMTP From Address", description: 'e.g. "Callora <noreply@callora.io>"', required: true, cleartext: true },

  // ---- Limits ----------------------------------------------------------
  { key: "DAILY_SPEND_CAP_DEFAULT_CENTS", group: "limits", label: "Default Daily Spend Cap (cents)", description: "Per-org daily ceiling on vendor spend.", required: false, cleartext: true },
  { key: "MONTHLY_SPEND_CAP_DEFAULT_CENTS", group: "limits", label: "Default Monthly Spend Cap (cents)", description: "Per-org monthly ceiling on vendor spend.", required: false, cleartext: true },
  { key: "TRIAL_CALL_CAP", group: "limits", label: "Trial Call Cap", description: "Max calls during the 14-day trial.", required: false, cleartext: true },
  { key: "NUMBER_PROVISIONING_MODE", group: "limits", label: "Number Provisioning Mode", description: "vapi-managed (default) | byo | pool.", required: false, cleartext: true },
];

const KEY_SET = new Set(SECRET_CATALOG.map((s) => s.key));

export function isManagedSecret(key: string): boolean {
  return KEY_SET.has(key);
}

export function getSecretMeta(key: string): SecretMeta | undefined {
  return SECRET_CATALOG.find((s) => s.key === key);
}
