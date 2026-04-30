/**
 * Boot-time environment validation for calling-service.
 * Mirrors backend/src/lib/env.ts. Fails loud on missing required vars.
 */

const REQUIRED_ENV = [
  "DATABASE_URL",
  "VAPI_PRIVATE_KEY",
  "VAPI_WEBHOOK_SECRET",
  "REDIS_URL",
] as const;

export function validateEnv(required: readonly string[] = REQUIRED_ENV): void {
  const missing = required.filter((key) => !process.env[key] || process.env[key] === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `calling-service refuses to boot. Set them in the environment or .env file.`
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
