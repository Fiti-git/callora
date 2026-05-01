// Database-backed secret backend. Reads PlatformSecret rows and decrypts
// values with SECRETS_ENCRYPTION_KEY. Falls back to process.env for the
// short list of BOOTSTRAP_SECRETS that must be available before the DB is.

import { SecretBackend, SecretNotFoundError } from "./backend.js";
import { decryptSecret } from "./crypto.js";
import prisma from "../prisma/index.js";

// Secrets the process needs before it can even open a DB connection.
// These MUST come from environment variables.
export const BOOTSTRAP_SECRETS = new Set<string>([
  "DATABASE_URL",
  "REDIS_URL",
  "NEXTAUTH_SECRET",
  "PLATFORM_JWT_SECRET",
  "SECRETS_ENCRYPTION_KEY",
]);

export class DbSecretBackend implements SecretBackend {
  readonly name = "db";

  async getSecret(name: string): Promise<string> {
    if (BOOTSTRAP_SECRETS.has(name)) {
      const v = process.env[name];
      if (v && v !== "") return v;
      throw new SecretNotFoundError(name, this.name);
    }
    const row = await prisma.platformSecret.findUnique({ where: { key: name } });
    if (!row) {
      // Fall back to env so a fresh box can boot before any secrets are set.
      const envVal = process.env[name];
      if (envVal && envVal !== "") return envVal;
      throw new SecretNotFoundError(name, this.name);
    }
    return decryptSecret(row.valueEncrypted);
  }

  getSecretSync(name: string): string {
    if (BOOTSTRAP_SECRETS.has(name)) {
      const v = process.env[name];
      if (v && v !== "") return v;
      throw new SecretNotFoundError(name, this.name);
    }
    // Sync path is bootstrap-only. Non-bootstrap secrets cannot be loaded sync
    // from the DB; callers must use the async getSecret().
    throw new Error(
      `getSecretSync("${name}") not supported by db backend; use async getSecret()`
    );
  }
}
