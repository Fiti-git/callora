// Pluggable secret backend interface.
//
// All secret backends implement `getSecret(name)` returning a Promise<string>.
// The active backend is selected at module load via the SECRETS_BACKEND env
// var (see ./index.ts).

export interface SecretBackend {
  /** Backend name, used for logging/audit. */
  readonly name: string;
  /** Fetch a single secret by canonical name. Throws if not found. */
  getSecret(name: string): Promise<string>;
  /**
   * Synchronous fetch — only required for boot-time secrets that must be
   * available before any async work (e.g. JWT signing keys). Backends that
   * cannot serve sync MUST throw.
   */
  getSecretSync(name: string): string;
}

export class SecretNotFoundError extends Error {
  constructor(name: string, backend: string) {
    super(`Secret "${name}" not found in backend "${backend}"`);
    this.name = "SecretNotFoundError";
  }
}

export class EnvSecretBackend implements SecretBackend {
  readonly name = "env";

  async getSecret(name: string): Promise<string> {
    return this.getSecretSync(name);
  }

  getSecretSync(name: string): string {
    const value = process.env[name];
    if (value === undefined || value === "") {
      throw new SecretNotFoundError(name, this.name);
    }
    return value;
  }
}
