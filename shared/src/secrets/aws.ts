import { SecretBackend } from "./backend.js";

// AWS Secrets Manager backend — STUB.
// TODO(wave-4): implement using @aws-sdk/client-secrets-manager. The real
// implementation should:
//   - Use a long-lived SecretsManagerClient
//   - Map canonical names (e.g. "STRIPE_SECRET_KEY") to ARNs via a config map
//   - Fall back to env vars for local dev when the AWS API is unreachable
//   - Honour AWS_REGION / explicit region constructor arg

export interface AwsSecretsManagerBackendOptions {
  region: string;
  /** Optional ARN/name prefix, e.g. "callora/prod/" */
  prefix?: string;
}

export class AwsSecretsManagerBackend implements SecretBackend {
  readonly name = "aws";
  private readonly region: string;
  private readonly prefix: string;

  constructor(opts: AwsSecretsManagerBackendOptions) {
    this.region = opts.region;
    this.prefix = opts.prefix ?? "";
  }

  async getSecret(_name: string): Promise<string> {
    throw new Error(
      `AwsSecretsManagerBackend.getSecret not implemented (region=${this.region}, prefix=${this.prefix}). TODO: implement in Wave 4.`,
    );
  }

  getSecretSync(_name: string): string {
    throw new Error(
      "AwsSecretsManagerBackend.getSecretSync not supported — AWS Secrets Manager is async only. Use getSecret() and await at boot.",
    );
  }
}
