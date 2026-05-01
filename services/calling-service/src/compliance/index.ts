// Public compliance API for calling-service.
//
// Every outbound call funnels through `complianceCheck`. Decisions are
// default-deny on uncertainty (DB error, missing org, invalid format).
// Logs use a redacted phone (last 4 digits) to avoid leaking PII into
// log aggregators.

import { prisma } from "@callora/shared";

import { isOnDnc } from "./dnc.js";
import { classifyNumber } from "./numberPolicy.js";
import { injectConsentDisclosure } from "./consent.js";
import { recordingRetentionDays } from "./retention.js";

export interface ComplianceResult {
  allowed: boolean;
  reason?: string;
  // `code` retained for backwards-compat with the prior stub shape.
  code?: string;
}

// Plan tiers permitted to dial international (non-NANP) numbers.
const INTERNATIONAL_ALLOWED_TIERS = new Set<string>(["PRO", "ENTERPRISE"]);

function redactPhone(phoneE164: string): string {
  if (!phoneE164 || phoneE164.length < 4) return "****";
  return `***${phoneE164.slice(-4)}`;
}

function log(level: "info" | "warn", msg: string, meta: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    service: "calling-service",
    component: "compliance",
    msg,
    ...meta,
  });
  if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * complianceCheck — single entry point for outbound-call gating.
 *
 * Returns `{ allowed: false, reason }` if the call must not proceed.
 * Reasons are short machine-readable codes that callers can persist on
 * the CallLog or surface in the UI.
 */
export async function complianceCheck(
  phoneE164: string,
  orgId: string
): Promise<ComplianceResult> {
  const phoneTag = redactPhone(phoneE164);

  // 1. Format validation
  const classification = classifyNumber(phoneE164);
  if (classification.kind === "invalid") {
    log("warn", "blocked_invalid_format", { phoneTag, orgId });
    return { allowed: false, reason: "invalid_phone_format" };
  }

  // 2. Premium-rate is never allowed
  if (classification.kind === "premium") {
    log("warn", "blocked_premium", {
      phoneTag,
      orgId,
      countryCode: classification.countryCode,
    });
    return { allowed: false, reason: "premium_rate_blocked" };
  }

  // 3. International requires plan tier
  if (classification.kind === "international") {
    let tier: string | null = null;
    try {
      const sub = await prisma.subscription.findUnique({
        where: { organizationId: orgId },
        include: { plan: true },
      });
      tier = sub?.plan?.tier ?? null;
    } catch (err) {
      log("warn", "compliance_check_failed_subscription", { phoneTag, orgId });
      return { allowed: false, reason: "compliance_check_failed" };
    }
    if (!tier || !INTERNATIONAL_ALLOWED_TIERS.has(tier)) {
      log("warn", "blocked_international_plan", {
        phoneTag,
        orgId,
        countryCode: classification.countryCode,
        tier,
      });
      return { allowed: false, reason: "international_not_allowed_on_plan" };
    }
  }

  // 4. DNC scrub (platform + tenant)
  const dnc = await isOnDnc(phoneE164, orgId);
  if (dnc.blocked) {
    log("warn", "blocked_dnc", {
      phoneTag,
      orgId,
      source: dnc.source,
      reason: dnc.reason,
    });
    return {
      allowed: false,
      reason: dnc.reason ?? "dnc_blocked",
    };
  }

  log("info", "allowed", {
    phoneTag,
    orgId,
    kind: classification.kind,
    countryCode: classification.countryCode,
  });
  return { allowed: true };
}

/**
 * addToDnc — admin/complaint-handler helper. Upserts a phone number into
 * the platform-wide DncEntry cache. Does NOT touch the per-tenant list.
 */
export async function addToDnc(
  phoneE164: string,
  source: string
): Promise<void> {
  if (!phoneE164 || !source) {
    throw new Error("addToDnc: phoneE164 and source are required");
  }
  await prisma.dncEntry.upsert({
    where: { phoneE164 },
    update: { source, addedAt: new Date(), expiresAt: null },
    create: { phoneE164, source },
  });
  log("info", "dnc_added", { phoneTag: redactPhone(phoneE164), source });
}

export { injectConsentDisclosure, recordingRetentionDays };
export { classifyNumber } from "./numberPolicy.js";
export { isOnDnc } from "./dnc.js";
export { checkFtcDnc } from "./ftcFallback.js";
