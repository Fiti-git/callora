/**
 * Phase 5 Agent M3 — Platform-side Vapi wrapper (Model B / hosted tier).
 *
 * These helpers run against Callora's MASTER Vapi account using
 * PLATFORM_VAPI_PRIVATE_KEY. They are tenant-agnostic — the caller (M4
 * provisioning worker) decides what persona to use for the assistant and
 * which org owns the resulting number.
 *
 * Idempotency strategy: every create-style call first does a list lookup
 * keyed on `name = "org-${orgId}"`. This is required because Vapi's REST
 * API doesn't accept an Idempotency-Key header, and worker retries (BullMQ)
 * must never double-buy a Twilio number.
 *
 * Errors: every thrown error is a `PlatformProvisioningError` whose
 * `.message` has been pushed through `scrubBrandStrings`. The original
 * upstream cause stays on `.cause` for Sentry / AuditLog consumers.
 *
 * BYOK paths in `backend/src/services/vapi.ts` are NOT modified here
 * (M5 owns the credential resolver). This module only talks to the
 * platform account.
 */

import axios, { AxiosError } from "axios";
import { Sentry, sentryEnabled } from "../../lib/sentry.js";
import { logger } from "../../lib/logger.js";
import { requireEnv } from "../../lib/env.js";
import { scrubBrandStrings } from "./brandScrub.js";

const VAPI_BASE_URL = "https://api.vapi.ai";

export type AssistantPersona = {
  /** Caller name spoken on the phone, e.g. "Alex" / "Sarah". */
  callerName: string;
  /** Tenant's brand name (NOT Callora's). Used in the first-message line. */
  companyName: string;
  /** Full system prompt assembled from persona + ICP. */
  systemPrompt: string;
  /** Optional voice override; default is an Eleven voice. */
  voice?: { provider: string; voiceId: string };
};

export type ProvisioningErrorCode =
  | "NUMBER_PROVISION_FAILED"
  | "ASSISTANT_PROVISION_FAILED"
  | "ATTACH_FAILED"
  | "RELEASE_FAILED";

export class PlatformProvisioningError extends Error {
  code: ProvisioningErrorCode;
  /**
   * Real upstream error preserved for Sentry/audit. Never bubble this to
   * a tenant — `.message` is the only field safe to surface.
   */
  override cause?: unknown;

  constructor(
    code: ProvisioningErrorCode,
    message: string,
    cause?: unknown
  ) {
    // Defence in depth: even if a caller passes a vendor-tainted string,
    // scrub before storing.
    super(scrubBrandStrings(message));
    this.name = "PlatformProvisioningError";
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Redact axios errors before logging — never log full response bodies, headers,
 * or request configs (they may contain Authorization headers).
 */
function redactAxiosError(err: unknown): Record<string, unknown> {
  const e = err as AxiosError<{ message?: string }>;
  return {
    status: e?.response?.status,
    statusText: e?.response?.statusText,
    code: e?.code,
    message: e?.message,
  };
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv("PLATFORM_VAPI_PRIVATE_KEY")}`,
    "Content-Type": "application/json",
  };
}

function isRetryableStatus(status: number | undefined): boolean {
  if (!status) return true; // network error, no response — retry
  return status >= 500 && status < 600;
}

/**
 * Sleep helper — extracted so tests can stub timers without flake. The
 * `setTimeout` global is what `vi.useFakeTimers` controls.
 */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an idempotent POST/DELETE/PATCH with up to 3 attempts. Retries 5xx
 * and network errors with exponential backoff (200ms, 400ms, 800ms). Any
 * 4xx is returned immediately — bad request bodies aren't fixed by retrying.
 */
async function withRetry<T>(
  op: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 200;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      const status = (err as AxiosError)?.response?.status;
      if (!isRetryableStatus(status)) throw err;
      if (i < attempts - 1) await sleep(base * Math.pow(2, i));
    }
  }
  throw lastErr;
}

function reportSentry(
  err: unknown,
  op: string,
  extra: Record<string, unknown>
): void {
  if (sentryEnabled) {
    Sentry.captureException(err, {
      tags: { component: "vapi-platform", op },
      extra,
    });
  }
}

// ---------------------------------------------------------------------------
// Phone number purchase
// ---------------------------------------------------------------------------

/**
 * Buy a Vapi-managed (Twilio-backed) phone number for a hosted-tier tenant.
 *
 * Idempotent: pre-flight GET /phone-number checks for an existing number
 * named `org-<orgId>`. If found → return it without re-purchasing.
 * If not → POST /phone-number with provider="vapi" so the master account
 * handles the underlying Twilio purchase.
 *
 * @returns the new (or existing) `vapiPhoneNumberId` and E.164 number.
 * @throws PlatformProvisioningError(NUMBER_PROVISION_FAILED) — brand-clean
 *         message, original cause attached for Sentry/audit.
 */
export async function purchaseTwilioNumber(opts: {
  orgId: string;
  areaCode?: string;
}): Promise<{ vapiPhoneNumberId: string; e164: string }> {
  const name = `org-${opts.orgId}`;
  try {
    // Pre-flight: list existing numbers on the platform account. Vapi
    // returns up to 100 by default which is fine for our scale.
    const existing = await withRetry(() =>
      axios.get(`${VAPI_BASE_URL}/phone-number`, { headers: authHeaders() })
    );
    const found = (existing.data as Array<{
      id: string;
      number?: string;
      name?: string;
    }>).find((n) => n.name === name);
    if (found && found.id && found.number) {
      logger.info(
        { orgId: opts.orgId, vapiPhoneNumberId: found.id },
        "[vapi-platform] reusing existing number for org"
      );
      return { vapiPhoneNumberId: found.id, e164: found.number };
    }

    // Create
    const body: Record<string, unknown> = {
      provider: "vapi",
      name,
    };
    if (opts.areaCode) body.numberDesiredAreaCode = opts.areaCode;

    const created = await withRetry(() =>
      axios.post(`${VAPI_BASE_URL}/phone-number`, body, {
        headers: authHeaders(),
      })
    );
    const data = created.data as { id: string; number: string };
    if (!data?.id || !data?.number) {
      throw new Error("Upstream returned an incomplete number record");
    }
    return { vapiPhoneNumberId: data.id, e164: data.number };
  } catch (err) {
    logger.error(
      redactAxiosError(err),
      "[vapi-platform] purchaseTwilioNumber failed"
    );
    reportSentry(err, "purchaseTwilioNumber", { orgId: opts.orgId });
    // brand-scrubbed; original cause in err.cause
    throw new PlatformProvisioningError(
      "NUMBER_PROVISION_FAILED",
      "We couldn't activate your business number. Our team has been alerted.",
      err
    );
  }
}

// ---------------------------------------------------------------------------
// Assistant create / delete
// ---------------------------------------------------------------------------

const DEFAULT_VOICE = { provider: "11labs", voiceId: "burt" };

/**
 * Create a Vapi assistant for a tenant. Idempotent on `name = org-<orgId>`.
 * The persona drives system prompt, first-message, and (optional) voice.
 *
 * @throws PlatformProvisioningError(ASSISTANT_PROVISION_FAILED) — brand-clean.
 */
export async function createAssistant(opts: {
  orgId: string;
  persona: AssistantPersona;
}): Promise<{ vapiAssistantId: string }> {
  const name = `org-${opts.orgId}`;
  try {
    // Pre-flight lookup — Vapi supports a `name` query filter on assistants.
    const existing = await withRetry(() =>
      axios.get(`${VAPI_BASE_URL}/assistant`, {
        headers: authHeaders(),
        params: { name },
      })
    );
    const found = (existing.data as Array<{ id: string; name?: string }>).find(
      (a) => a.name === name
    );
    if (found && found.id) {
      logger.info(
        { orgId: opts.orgId, vapiAssistantId: found.id },
        "[vapi-platform] reusing existing assistant for org"
      );
      return { vapiAssistantId: found.id };
    }

    const body = {
      name,
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: opts.persona.systemPrompt }],
      },
      voice: opts.persona.voice ?? DEFAULT_VOICE,
      firstMessage: `Hi, this is ${opts.persona.callerName} from ${opts.persona.companyName}.`,
    };

    const created = await withRetry(() =>
      axios.post(`${VAPI_BASE_URL}/assistant`, body, {
        headers: authHeaders(),
      })
    );
    const data = created.data as { id: string };
    if (!data?.id) {
      throw new Error("Upstream returned an incomplete assistant record");
    }
    return { vapiAssistantId: data.id };
  } catch (err) {
    logger.error(
      redactAxiosError(err),
      "[vapi-platform] createAssistant failed"
    );
    reportSentry(err, "createAssistant", { orgId: opts.orgId });
    // brand-scrubbed; original cause in err.cause
    throw new PlatformProvisioningError(
      "ASSISTANT_PROVISION_FAILED",
      "We couldn't set up the AI dialer for your account. Our team has been alerted.",
      err
    );
  }
}

/**
 * Bind an assistant to a phone number on the platform account.
 * PATCH is idempotent — Vapi treats `assistantId` as upsert.
 *
 * @throws PlatformProvisioningError(ATTACH_FAILED) — brand-clean.
 */
export async function attachAssistantToNumber(opts: {
  vapiAssistantId: string;
  vapiPhoneNumberId: string;
}): Promise<void> {
  try {
    await withRetry(() =>
      axios.patch(
        `${VAPI_BASE_URL}/phone-number/${opts.vapiPhoneNumberId}`,
        { assistantId: opts.vapiAssistantId },
        { headers: authHeaders() }
      )
    );
  } catch (err) {
    logger.error(
      redactAxiosError(err),
      "[vapi-platform] attachAssistantToNumber failed"
    );
    reportSentry(err, "attachAssistantToNumber", {
      vapiAssistantId: opts.vapiAssistantId,
      vapiPhoneNumberId: opts.vapiPhoneNumberId,
    });
    // brand-scrubbed; original cause in err.cause
    throw new PlatformProvisioningError(
      "ATTACH_FAILED",
      "We couldn't link your AI dialer to your business number. Our team has been alerted.",
      err
    );
  }
}

/**
 * Delete an assistant. Idempotent — a 404 from upstream means it's already
 * gone, which is fine.
 *
 * @throws PlatformProvisioningError(ASSISTANT_PROVISION_FAILED) on non-404 errors.
 */
export async function deleteAssistant(vapiAssistantId: string): Promise<void> {
  try {
    await withRetry(() =>
      axios.delete(`${VAPI_BASE_URL}/assistant/${vapiAssistantId}`, {
        headers: authHeaders(),
      })
    );
  } catch (err) {
    const status = (err as AxiosError)?.response?.status;
    if (status === 404) return; // already gone — idempotent OK
    logger.error(
      redactAxiosError(err),
      "[vapi-platform] deleteAssistant failed"
    );
    reportSentry(err, "deleteAssistant", { vapiAssistantId });
    // brand-scrubbed; original cause in err.cause
    throw new PlatformProvisioningError(
      "ASSISTANT_PROVISION_FAILED",
      "We couldn't remove the AI dialer profile. Our team has been alerted.",
      err
    );
  }
}

/**
 * Release a phone number. Idempotent — 404 OK.
 *
 * @throws PlatformProvisioningError(RELEASE_FAILED) on non-404 errors.
 */
export async function releaseNumber(
  vapiPhoneNumberId: string
): Promise<void> {
  try {
    await withRetry(() =>
      axios.delete(`${VAPI_BASE_URL}/phone-number/${vapiPhoneNumberId}`, {
        headers: authHeaders(),
      })
    );
  } catch (err) {
    const status = (err as AxiosError)?.response?.status;
    if (status === 404) return; // already gone — idempotent OK
    logger.error(
      redactAxiosError(err),
      "[vapi-platform] releaseNumber failed"
    );
    reportSentry(err, "releaseNumber", { vapiPhoneNumberId });
    // brand-scrubbed; original cause in err.cause
    throw new PlatformProvisioningError(
      "RELEASE_FAILED",
      "We couldn't release the business number. Our team has been alerted.",
      err
    );
  }
}
