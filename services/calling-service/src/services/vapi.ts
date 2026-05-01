import {
  meterAndCharge,
  prisma,
  ConsentRequiredError,
  DNCBlockedError,
  logger,
} from "@callora/shared";
import crypto from "node:crypto";
import { createCall, getCall } from "./vapiClient.js";
import { pickPoolNumber, getProvisioningMode } from "./numberProvisioner.js";
import { complianceCheck } from "../compliance/index.js";

// --------------------------------------------------------------------------
// Brand scrub — keep in sync with backend/src/services/provisioning/brandScrub.
// --------------------------------------------------------------------------
const SCRUB_PATTERNS: ReadonlyArray<{ p: RegExp; r: string }> = [
  { p: /\bgoogle\s*places\b/gi, r: "the lead engine" },
  { p: /\belevenlabs\b/gi, r: "the dialer" },
  { p: /\b11labs\b/gi, r: "the dialer" },
  { p: /\bdeepgram\b/gi, r: "the dialer" },
  { p: /\btwilio\b/gi, r: "the dialer" },
  { p: /\bvapi\b/gi, r: "the dialer" },
  { p: /\bbland\b/gi, r: "the dialer" },
  { p: /\bgemini\b/gi, r: "the lead engine" },
  { p: /\bresend\b/gi, r: "the email service" },
];
function scrubBrandStrings(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { p, r } of SCRUB_PATTERNS) out = out.replace(p, r);
  out = out.replace(/(\bthe\s+dialer)(\s+the\s+dialer)+\b/gi, "$1");
  out = out.replace(
    /(\bthe\s+lead\s+engine)(\s+the\s+lead\s+engine)+\b/gi,
    "$1"
  );
  return out;
}

const TRIAL_CALL_CAP = Number(process.env.TRIAL_CALL_CAP ?? "20");

function normalizeE164(raw: string): string {
  if (!raw) return "";
  let p = raw.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.length === 10) return "+1" + p;
  if (p.length === 11 && p.startsWith("1")) return "+" + p;
  return p;
}
function hashPhone(e164: string): string {
  const pepper = process.env.DNC_HASH_PEPPER;
  if (!pepper) throw new Error("DNC_HASH_PEPPER is not set");
  return crypto.createHash("sha256").update(`${pepper}|${e164}`).digest("hex");
}
async function isOnDNC(phone: string, orgId: string) {
  const e164 = normalizeE164(phone);
  if (!e164) return { onDnc: false as const };
  const phoneHash = hashPhone(e164);
  const row = await prisma.dNCEntry.findFirst({
    where: { phoneHash, OR: [{ organizationId: orgId }, { organizationId: null }] },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { onDnc: false as const };
  return { onDnc: true as const, source: row.source };
}

export interface CostBreakdown {
  transport?: number;
  stt?: number;
  llm?: number;
  tts?: number;
  vapi?: number;
  total?: number;
}

export interface CallResult {
  status: "COMPLETED" | "NO_ANSWER" | "VOICEMAIL" | "FAILED" | "IN_PROGRESS";
  durationSeconds: number;
  transcript?: string;
  summary?: string;
  vapiCallId?: string;
  cost?: number;
  costBreakdown?: CostBreakdown;
}

export interface VapiOrgConfig {
  aiCallerName: string;
  aiCallerCompany: string;
  aiCallerPhone: string;
  aiSystemPrompt?: string | null;
}

export class TrialCallCapExceededError extends Error {
  readonly name = "TrialCallCapExceededError";
  readonly cap: number;
  constructor(cap: number) {
    super(`Trial call cap of ${cap} reached. Upgrade to a paid plan to continue.`);
    this.cap = cap;
  }
}

export class NoAvailableNumberError extends Error {
  readonly name = "NoAvailableNumberError";
  constructor(msg: string) {
    super(msg);
  }
}

export class NumberNotProvisionedError extends Error {
  readonly name = "NumberNotProvisionedError";
  constructor(msg: string = "Phone number is being prepared, please try again in a moment") {
    super(msg);
  }
}

/**
 * Build the system prompt sent to Vapi/OpenAI. Refuses to dial if the org
 * never set its prompt (would otherwise leak someone else's branding).
 */
export function buildSystemPrompt(orgConfig: VapiOrgConfig): string {
  if (!orgConfig.aiSystemPrompt || orgConfig.aiSystemPrompt.trim().length === 0) {
    throw new Error(
      "AI system prompt is not configured for this organization. " +
        "Please set it under Settings before starting a campaign."
    );
  }
  return orgConfig.aiSystemPrompt;
}

function formatPhone(businessPhone: string): string {
  let formattedPhone = businessPhone.replace(/[^0-9+]/g, "");
  if (!formattedPhone.startsWith("+")) {
    if (formattedPhone.length === 10) {
      formattedPhone = "+1" + formattedPhone;
    } else if (formattedPhone.length === 11 && formattedPhone.startsWith("1")) {
      formattedPhone = "+" + formattedPhone;
    }
  }
  return formattedPhone;
}

/**
 * Resolve which Vapi phoneNumberId to use for a given org:
 *   - if the org has an ACTIVE OrgVapiNumber → that
 *   - else (trial / no provisioning yet) → pick a POOL number with
 *     best-effort area-code match against the lead's number
 *   - if neither available → NoAvailableNumberError
 */
async function resolveOutboundNumberId(
  organizationId: string,
  leadPhoneE164: string
): Promise<{ phoneNumberId: string; isPool: boolean }> {
  const own = await prisma.orgVapiNumber.findUnique({
    where: { organizationId },
  });
  if (own && own.status === "ACTIVE") {
    return { phoneNumberId: own.vapiPhoneNumberId, isPool: false };
  }

  const mode = getProvisioningMode();
  if (mode !== "pool") {
    // Vapi-managed / BYO: org-owned number is mandatory. No pool fallback.
    throw new NumberNotProvisionedError();
  }

  // Pool mode (legacy): derive area code from destination, pick a pool number.
  const digits = leadPhoneE164.replace(/[^0-9]/g, "");
  const areaCode = digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);

  const pool = await pickPoolNumber(areaCode || undefined);
  if (!pool) {
    throw new NoAvailableNumberError(
      "No outbound number available for this organization."
    );
  }
  return { phoneNumberId: pool.vapiPhoneNumberId, isPool: true };
}

/**
 * Trial-org call cap. Counts CallLog rows scoped via Lead → Organization.
 */
async function assertWithinTrialCap(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  if (!org) return;
  if (org.status !== "TRIAL") return;

  const used = await prisma.callLog.count({
    where: { lead: { organizationId } },
  });
  if (used >= TRIAL_CALL_CAP) {
    throw new TrialCallCapExceededError(TRIAL_CALL_CAP);
  }
}

/**
 * Pre-flight: compliance + TCPA + DNC + trial cap. Throws on block.
 * Returns the normalized E.164 number.
 */
async function preflight(
  businessPhone: string,
  organizationId: string
): Promise<string> {
  const formattedPhone = formatPhone(businessPhone);

  const lead = await prisma.lead.findFirst({
    where: { phone: businessPhone, organizationId },
    select: { id: true, consentGiven: true, doNotCall: true },
  });
  if (lead) {
    if (lead.doNotCall) throw new ConsentRequiredError("DO_NOT_CALL", lead.id);
    if (!lead.consentGiven) throw new ConsentRequiredError("NO_CONSENT", lead.id);
  }
  const dnc = await isOnDNC(formattedPhone, organizationId);
  if (dnc.onDnc) throw new DNCBlockedError(dnc.source, lead?.id);

  // Compliance hook (Agent 2D will fill in).
  const compliance = await complianceCheck(formattedPhone, organizationId);
  if (!compliance.allowed) {
    throw new DNCBlockedError(
      compliance.code ?? compliance.reason ?? "compliance_block",
      lead?.id
    );
  }

  await assertWithinTrialCap(organizationId);

  return formattedPhone;
}

/**
 * Service object for placing/observing Vapi calls. No constructor args —
 * the platform Vapi key is resolved lazily inside vapiClient.
 */
export class VapiService {
  /**
   * Initiate an outbound call and return the Vapi call ID immediately.
   * Resolves the outbound number from OrgVapiNumber / pool.
   */
  async initiateCall(
    businessPhone: string,
    businessName: string,
    orgConfig: VapiOrgConfig,
    organizationId: string
  ): Promise<{ vapiCallId: string }> {
    if (!organizationId) {
      throw new Error(scrubBrandStrings("organizationId is required to place a call"));
    }
    const systemPrompt = buildSystemPrompt(orgConfig);
    const formattedPhone = await preflight(businessPhone, organizationId);

    const { phoneNumberId } = await resolveOutboundNumberId(
      organizationId,
      formattedPhone
    );

    // Charge BEFORE dialing so a quota-exhausted org doesn't burn a call.
    await meterAndCharge(organizationId, "VAPI_CALL", 1);

    const { id } = await createCall({
      phoneNumberId,
      toNumber: formattedPhone,
      customerName: businessName,
      firstMessage: `Hi, is this from ${businessName}?`,
      systemPrompt,
    });
    return { vapiCallId: id };
  }

  /**
   * Fetch a single Vapi call by id and translate its status into CallResult.
   */
  async fetchCallStatus(callId: string): Promise<CallResult> {
    const call = await getCall(callId);

    if (call.status !== "ended") {
      return {
        status: "IN_PROGRESS",
        durationSeconds: 0,
        vapiCallId: callId,
      };
    }

    const reason = call.endedReason;
    let status: CallResult["status"] = "COMPLETED";
    if (reason === "customer-did-not-answer" || reason === "ring-timeout") {
      status = "NO_ANSWER";
    } else if (reason === "voicemail") {
      status = "VOICEMAIL";
    }

    const transcript = call.transcript || call.artifact?.transcript || null;
    const summary = call.analysis?.summary || null;

    return {
      status,
      durationSeconds: call.durationSeconds || 0,
      transcript: transcript
        ? typeof transcript === "string"
          ? transcript
          : JSON.stringify(transcript)
        : undefined,
      summary: summary || undefined,
      vapiCallId: callId,
      cost: call.cost ?? undefined,
      costBreakdown: call.costBreakdown ?? undefined,
    };
  }

  async makeCall(
    businessPhone: string,
    businessName: string,
    orgConfig: VapiOrgConfig,
    organizationId: string
  ): Promise<CallResult> {
    try {
      const { vapiCallId } = await this.initiateCall(
        businessPhone,
        businessName,
        orgConfig,
        organizationId
      );
      return await this.pollForCompletion(vapiCallId);
    } catch (error: any) {
      // Quota / cap / consent errors must propagate.
      if (
        error?.name === "QuotaExceededError" ||
        error?.name === "TrialCallCapExceededError" ||
        error?.name === "ConsentRequiredError" ||
        error?.name === "DNCBlockedError" ||
        error?.name === "NoAvailableNumberError" ||
        error?.name === "NumberNotProvisionedError"
      ) {
        throw error;
      }
      logger.error({
        code: error?.code,
        err: error?.message,
      }, "[vapi] Call Failed");
      return { status: "FAILED", durationSeconds: 0 };
    }
  }

  private async pollForCompletion(callId: string): Promise<CallResult> {
    const maxRetries = 80;
    let attempts = 0;

    while (attempts < maxRetries) {
      const delayMs = attempts < 10 ? 3000 : 5000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempts++;

      try {
        const result = await this.fetchCallStatus(callId);
        if (result.status !== "IN_PROGRESS") return result;
      } catch (err: any) {
        logger.error({ code: err?.code, err: err?.message }, "[vapi] poll error");
      }
    }

    return {
      status: "FAILED",
      durationSeconds: 300,
      transcript: "Timeout waiting for call to end.",
    };
  }
}
