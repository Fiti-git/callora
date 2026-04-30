/**
 * Phase 5 Agent M5 — Credential resolver.
 *
 * Single source of truth for "which API key should we hand to the upstream
 * SDK for this org+provider call?". Branches on Organization.billingMode +
 * TenantProvisioning.status:
 *
 *   PAYG / SUBSCRIPTION  → platform-managed creds (Callora's master keys),
 *                          gated on TenantProvisioning.status === "READY"
 *                          for VAPI (assistant + phone number must exist).
 *
 *   BYOK                 → tenant-supplied creds from the ApiKey row;
 *                          decrypted on the way out.
 *
 * Existing BYOK code paths in services/{vapi,gemini,places}.ts are left in
 * place — this resolver just decides which key to instantiate them with.
 */
import prisma from "./prisma.js";
import { requireEnv } from "./env.js";
import { decryptString } from "./crypto.js";

export type Provider = "VAPI" | "GEMINI" | "PLACES";

export type Resolution =
  | {
      kind: "PLATFORM";
      apiKey: string;
      vapiAssistantId?: string;
      vapiPhoneNumberId?: string;
    }
  | {
      kind: "BYOK";
      apiKey: string;
      vapiPhoneNumberId?: string;
    };

export type CredentialErrorCode =
  | "PROVISIONING_NOT_READY"
  | "BYOK_KEY_MISSING"
  | "INVALID_BILLING_MODE";

export class CredentialsUnavailableError extends Error {
  readonly code: CredentialErrorCode;
  readonly provider: Provider;
  readonly status = 402 as const;
  constructor(code: CredentialErrorCode, provider: Provider, message?: string) {
    super(message ?? `${code} for provider=${provider}`);
    this.name = "CredentialsUnavailableError";
    this.code = code;
    this.provider = provider;
  }
}

interface OrgWithCreds {
  id: string;
  billingMode: "PAYG" | "SUBSCRIPTION" | "BYOK";
  apiKeys: {
    googleMapsKey: string | null;
    geminiKey: string | null;
    vapiKey: string | null;
    vapiPhoneId: string | null;
  } | null;
  provisioning: {
    status: string;
    vapiAssistantId: string | null;
    vapiPhoneNumberId: string | null;
  } | null;
}

/**
 * Pure decision helper — exposed for unit tests so we can exercise every
 * branch without touching the DB. The DB-bound `resolveCredentials` below
 * is a thin wrapper that loads the org row and delegates here.
 */
export function resolveFromOrg(
  org: OrgWithCreds,
  provider: Provider
): Resolution {
  const mode = org.billingMode;

  if (mode === "PAYG" || mode === "SUBSCRIPTION") {
    if (provider === "VAPI") {
      // VAPI on hosted requires a per-org assistant + phone number — both
      // are populated by the provisioning worker, gated behind READY.
      if (
        !org.provisioning ||
        org.provisioning.status !== "READY" ||
        !org.provisioning.vapiAssistantId ||
        !org.provisioning.vapiPhoneNumberId
      ) {
        throw new CredentialsUnavailableError(
          "PROVISIONING_NOT_READY",
          provider,
          "Your account is still being set up. This usually takes a minute."
        );
      }
      return {
        kind: "PLATFORM",
        apiKey: requireEnv("PLATFORM_VAPI_PRIVATE_KEY"),
        vapiAssistantId: org.provisioning.vapiAssistantId,
        vapiPhoneNumberId: org.provisioning.vapiPhoneNumberId,
      };
    }
    if (provider === "GEMINI") {
      return {
        kind: "PLATFORM",
        apiKey: requireEnv("PLATFORM_GEMINI_API_KEY"),
      };
    }
    // PLACES — no provisioning state needed; key alone is enough.
    return {
      kind: "PLATFORM",
      apiKey: requireEnv("PLATFORM_GOOGLE_PLACES_API_KEY"),
    };
  }

  if (mode === "BYOK") {
    const keys = org.apiKeys;
    if (provider === "VAPI") {
      if (!keys?.vapiKey || !keys?.vapiPhoneId) {
        throw new CredentialsUnavailableError(
          "BYOK_KEY_MISSING",
          provider,
          "Bring-your-own-keys mode is enabled but the dialer credentials are not set."
        );
      }
      return {
        kind: "BYOK",
        apiKey: decryptString(keys.vapiKey),
        vapiPhoneNumberId: keys.vapiPhoneId,
      };
    }
    if (provider === "GEMINI") {
      if (!keys?.geminiKey) {
        throw new CredentialsUnavailableError(
          "BYOK_KEY_MISSING",
          provider,
          "Bring-your-own-keys mode is enabled but the lead-engine credentials are not set."
        );
      }
      return { kind: "BYOK", apiKey: decryptString(keys.geminiKey) };
    }
    // PLACES
    if (!keys?.googleMapsKey) {
      throw new CredentialsUnavailableError(
        "BYOK_KEY_MISSING",
        provider,
        "Bring-your-own-keys mode is enabled but the lead-engine credentials are not set."
      );
    }
    return { kind: "BYOK", apiKey: decryptString(keys.googleMapsKey) };
  }

  throw new CredentialsUnavailableError(
    "INVALID_BILLING_MODE",
    provider,
    `Unsupported billing mode for credential resolution.`
  );
}

/**
 * Resolve credentials for `provider` for the given organization. Reads the
 * org + apiKeys + provisioning rows in a single Prisma call.
 */
export async function resolveCredentials(
  organizationId: string,
  provider: Provider
): Promise<Resolution> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      billingMode: true,
      apiKeys: {
        select: {
          googleMapsKey: true,
          geminiKey: true,
          vapiKey: true,
          vapiPhoneId: true,
        },
      },
      provisioning: {
        select: {
          status: true,
          vapiAssistantId: true,
          vapiPhoneNumberId: true,
        },
      },
    },
  });
  if (!org) {
    throw new CredentialsUnavailableError(
      "INVALID_BILLING_MODE",
      provider,
      "Organization not found."
    );
  }
  return resolveFromOrg(org as unknown as OrgWithCreds, provider);
}
