// Per-service secret manifest for calling-service.
// Only secrets in ALLOWED_SECRETS may be requested via getServiceSecret().

import { getSecret, getSecretSync } from "@callora/shared";

export const SERVICE_NAME = "calling-service";

export const ALLOWED_SECRETS = [
  "VAPI_PRIVATE_KEY",
  "VAPI_PHONE_NUMBER_ID",
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
