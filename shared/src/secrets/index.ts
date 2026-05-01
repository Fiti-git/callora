// Public secrets API.
//
// Usage:
//   import { getSecret, getSecretSync } from "@callora/shared";
//   const stripeKey = await getSecret("STRIPE_SECRET_KEY");
//
// Per-service allow-lists live in services/<name>/src/config.ts and call
// getSecret() under the hood. Direct callers of getSecret() bypass the
// allow-list and should generally be avoided outside boot code.

import {
  EnvSecretBackend,
  SecretBackend,
  SecretNotFoundError,
} from "./backend.js";
import { AwsSecretsManagerBackend } from "./aws.js";
import { DbSecretBackend } from "./db.js";
import {
  clearCache as clearSecretCache,
  clearInflight,
  getCached,
  getInflight,
  setCached,
  setInflight,
  SECRET_TTL_MS,
} from "./cache.js";
import { logKeyAccess } from "./audit.js";

export type SecretBackendName = "env" | "aws" | "db";

function selectBackend(): SecretBackend {
  const choice = (process.env.SECRETS_BACKEND ?? "db").toLowerCase();
  switch (choice) {
    case "aws": {
      const region = process.env.AWS_REGION ?? "us-east-1";
      const prefix = process.env.AWS_SECRETS_PREFIX;
      return new AwsSecretsManagerBackend({ region, prefix });
    }
    case "db":
      return new DbSecretBackend();
    case "env":
    default:
      return new EnvSecretBackend();
  }
}

// Initialised once at module load. Tests may call _resetBackendForTesting().
let backend: SecretBackend = selectBackend();

/** Internal — for tests only. Re-reads SECRETS_BACKEND and clears cache. */
export function _resetBackendForTesting(): void {
  backend = selectBackend();
  clearSecretCache();
}

/** Caller-supplied service identifier for audit logging. */
function callerService(): string {
  return process.env.SERVICE_NAME ?? "unknown";
}

/**
 * Fetch a secret by canonical name. Cached for 10 minutes. Concurrent reads
 * for the same key share a single in-flight Promise.
 */
export async function getSecret(name: string): Promise<string> {
  const cached = getCached(name);
  if (cached !== undefined) return cached;

  const existing = getInflight(name);
  if (existing) return existing;

  const p = (async () => {
    try {
      const value = await backend.getSecret(name);
      setCached(name, value);
      logKeyAccess({
        service: callerService(),
        keyName: name,
        success: true,
        backend: backend.name,
      });
      return value;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logKeyAccess({
        service: callerService(),
        keyName: name,
        success: false,
        backend: backend.name,
        errorMessage: msg,
      });
      throw err;
    } finally {
      clearInflight(name);
    }
  })();

  setInflight(name, p);
  return p;
}

/**
 * Synchronous secret fetch for boot-time wiring (e.g. JWT secret needed
 * before the HTTP server starts). Only supported by backends that can serve
 * sync (env). Bypasses the cache write/read logic on miss but populates it.
 */
export function getSecretSync(name: string): string {
  const cached = getCached(name);
  if (cached !== undefined) return cached;
  try {
    const value = backend.getSecretSync(name);
    setCached(name, value);
    logKeyAccess({
      service: callerService(),
      keyName: name,
      success: true,
      backend: backend.name,
    });
    return value;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logKeyAccess({
      service: callerService(),
      keyName: name,
      success: false,
      backend: backend.name,
      errorMessage: msg,
    });
    throw err;
  }
}

/** Clear the in-memory cache. Useful in tests and on SIGHUP. */
export function clearCache(): void {
  clearSecretCache();
}

export {
  SECRET_TTL_MS,
  SecretNotFoundError,
  EnvSecretBackend,
  AwsSecretsManagerBackend,
  DbSecretBackend,
};
export { encryptSecret, decryptSecret, maskSecret } from "./crypto.js";
export { BOOTSTRAP_SECRETS } from "./db.js";
export type { SecretBackend };
