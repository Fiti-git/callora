/**
 * Boot-time environment validation for campaign-service.
 * Mirrors backend/src/lib/env.ts.
 */

const REQUIRED_ENV = [
  "DATABASE_URL",
  "REDIS_URL",
  "CALLING_SERVICE_URL",
  "NOTIFICATION_SERVICE_URL",
  "LEAD_SERVICE_URL",
] as const;

export function validateEnv(required: readonly string[] = REQUIRED_ENV): void {
  const missing = required.filter((key) => !process.env[key] || process.env[key] === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `campaign-service refuses to boot. Set them in the environment or .env file.`
    );
  }
}

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
