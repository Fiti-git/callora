/**
 * Boot-time environment validation.
 *
 * Required env vars are checked at module load. If any are missing the process
 * throws immediately rather than failing later with a confusing per-request
 * error. Import this module from any entry point that needs validated env.
 */

const REQUIRED_ENV = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "PLATFORM_JWT_SECRET",
  "VAPI_WEBHOOK_SECRET",
  // Used by /auth verify-email links — fails loud if missing so we never
  // ship a half-broken email with a localhost link in production.
  "TENANT_APP_ORIGIN",
  // 64 hex chars (32 bytes). Encrypts User.twoFASecret at rest with
  // AES-256-GCM. See backend/src/lib/crypto.ts. Must be the same value
  // across all backend instances — rotating it locks every enrolled user
  // out of 2FA, so treat it like NEXTAUTH_SECRET.
  "TWOFA_ENCRYPTION_KEY",
  // TCPA compliance (Phase 2 Agent 9). Static platform-wide secret mixed
  // into sha256(phone) before storing in DNCEntry — prevents trivial rainbow
  // lookups on the DNC table. Same value across all backend instances.
  "DNC_HASH_PEPPER",
  // Resend webhook signature secret (bounce/complaint events feed
  // EmailSuppression). Without it the webhook refuses all events.
  "RESEND_WEBHOOK_SECRET",
  // Phase 5 Agent M2 — PAYG / Model B billing config.
  // Stripe Price ID for the $25 top-up product. Required so the system can
  // never silently mis-bill: chargeTopUp validates manual amount against the
  // amount this price represents (server-enforced, hard-coded 2500 at launch).
  "STRIPE_PRICE_PAYG_TOPUP_25",
  // Threshold (cents) at which the low-balance UX banner + email fires.
  // Default $10. Required (no fallback) so any environment that forgets to
  // set it fails boot rather than silently skipping the alert.
  "PAYG_LOW_BALANCE_ALERT_CENTS",
  // Default auto-recharge threshold (cents) used for new CreditLedger rows.
  // Tenants can override per-org via PATCH /api/billing/credits/auto-recharge.
  "PAYG_AUTO_RECHARGE_DEFAULT_THRESHOLD_CENTS",
  // Default auto-recharge top-up amount (cents). $25 at launch.
  "PAYG_AUTO_RECHARGE_DEFAULT_AMOUNT_CENTS",
  // Phase 5 Agent M3 — Model B (hosted) platform-side provisioning.
  // Callora's master Vapi account API key. Used by the platform Vapi wrapper
  // (services/provisioning/vapiPlatform.ts) to buy Twilio numbers and create
  // assistants on behalf of hosted-tier tenants. NOT to be confused with the
  // tenant-owned Vapi key in ApiKey (BYOK path). If this is missing the
  // hosted provisioning flow cannot run, so we fail boot with a clear message.
  "PLATFORM_VAPI_PRIVATE_KEY",
  // Callora's master Gemini key for hosted-tier lead qualification (Model B).
  // Declared here so M3+M4 can rely on it being present at boot — M5 wires
  // the credential resolver that picks platform vs tenant key per call.
  "PLATFORM_GEMINI_API_KEY",
  // Callora's master Google Places key for hosted-tier lead discovery.
  "PLATFORM_GOOGLE_PLACES_API_KEY",
  // Phase 5 Agent M5 — PAYG markup + per-unit pricing.
  // PAYG_MARKUP_PCT is applied to every raw cost before debiting the ledger
  // (e.g. 30 → +30%). Required so a missing config can never silently bill
  // tenants at break-even.
  "PAYG_MARKUP_PCT",
  // Flat per-unit costs (cents) for non-Vapi metered debits. Vapi is read
  // from CallLog.cost in the per-call reconciliation step.
  "PAYG_GEMINI_CENTS_PER_QUALIFICATION",
  "PAYG_PLACES_CENTS_PER_SEARCH",
  "PAYG_EMAIL_CENTS_PER_SEND",
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

export function validateEnv(required: readonly string[] = REQUIRED_ENV): void {
  const missing = required.filter((key) => !process.env[key] || process.env[key] === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Refusing to boot. Set them in the environment or .env file.`
    );
  }
}

// Run validation at module load. Tests that need to assert this behaviour
// should import { validateEnv } directly and pass an explicit list.
if (process.env.NODE_ENV !== "test") {
  validateEnv();
}

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`Required env var ${key} is not set`);
  }
  return v;
}

/**
 * Read an optional env var. Returns `undefined` when unset/empty so callers
 * can branch on whether a feature is configured.
 *
 * Used for opt-in integrations like SSO providers (GOOGLE_CLIENT_ID etc.)
 * where the absence of the env var means "feature disabled" rather than
 * "fail boot".
 */
export function optionalEnv(key: string): string | undefined {
  const v = process.env[key];
  if (!v || v === "") return undefined;
  return v;
}
