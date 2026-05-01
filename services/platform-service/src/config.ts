// Per-service secret manifest for platform-service.
// Only secrets in ALLOWED_SECRETS may be requested via getServiceSecret().

import { getSecret, getSecretSync } from "@callora/shared";

export const SERVICE_NAME = "platform-service";

// Allowed secrets:
//  - PLATFORM_JWT_SECRET: signing/verifying super-admin JWTs.
//  - HCAPTCHA_SECRET: hCaptcha "secret" for verifying signup captcha tokens
//    (Agent 2E — Fraud / Anomaly Detection). Optional in dev: when unset,
//    captcha verification logs a warning and falls through to allow.
export const ALLOWED_SECRETS = [
  "PLATFORM_JWT_SECRET",
  "HCAPTCHA_SECRET",
] as const;

export type AllowedSecret = (typeof ALLOWED_SECRETS)[number];

function assertAllowed(name: string): asserts name is AllowedSecret {
  if (!(ALLOWED_SECRETS as readonly string[]).includes(name)) {
    throw new Error(
      `[${SERVICE_NAME}] secret "${name}" is not in the allow-list. Add it to ALLOWED_SECRETS in services/${SERVICE_NAME}/src/config.ts if it is genuinely required.`,
    );
  }
}

export async function getServiceSecret(name: AllowedSecret): Promise<string> {
  assertAllowed(name);
  return getSecret(name);
}

export function getServiceSecretSync(name: AllowedSecret): string {
  assertAllowed(name);
  return getSecretSync(name);
}
