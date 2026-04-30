import axios from "axios";
import {
  meterAndCharge,
  prisma,
  ConsentRequiredError,
  DNCBlockedError,
} from "@callora/shared";
import crypto from "node:crypto";

// --------------------------------------------------------------------------
// Phase 5 Agent M3 — local brand-scrub.
//
// The monolith has its own brandScrub module under
// backend/src/services/provisioning/. The calling-service is a separate
// package and should not reach across the package boundary, so we inline
// the same banned-string list here. Keep this in sync with
// backend/src/services/provisioning/brandScrub.ts.
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

/**
 * Builds the system prompt sent to Vapi/OpenAI.
 *
 * SAFETY: campaigns must NOT run with a generic, branded fallback prompt.
 * If the org has not configured an AI system prompt in Settings, throw —
 * otherwise we'd dial real prospects with someone else's branding.
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

function redactAxiosError(err: any): Record<string, unknown> {
  return {
    status: err?.response?.status,
    statusText: err?.response?.statusText,
    code: err?.code,
    message: err?.message,
  };
}

export class VapiService {
  private baseUrl = "https://api.vapi.ai";
  private privateKey: string;
  private phoneNumberId: string;

  constructor(privateKey: string, phoneNumberId: string) {
    this.privateKey = privateKey;
    this.phoneNumberId = phoneNumberId;
  }

  private formatPhone(businessPhone: string): string {
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
   * Initiate an outbound call and return the Vapi call ID immediately.
   * Does NOT poll. Used by /internal/call.
   */
  async initiateCall(
    businessPhone: string,
    businessName: string,
    orgConfig: VapiOrgConfig,
    organizationId?: string
  ): Promise<{ vapiCallId: string }> {
    if (!this.privateKey || !this.phoneNumberId) {
      // brand-scrubbed; original cause in err.cause
      throw new Error(
        scrubBrandStrings("Vapi Configuration Missing for this organization.")
      );
    }
    const formattedPhone = this.formatPhone(businessPhone);
    const systemPrompt = buildSystemPrompt(orgConfig);

    // ----- TCPA gates (Phase 2 Agent 9) -----
    if (organizationId) {
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
    }

    // Charge BEFORE we hit Vapi so a quota-exhausted org doesn't dial.
    if (organizationId) {
      await meterAndCharge(organizationId, "VAPI_CALL", 1);
    }

    const response = await axios.post(
      `${this.baseUrl}/call`,
      {
        phoneNumberId: this.phoneNumberId,
        customer: { number: formattedPhone, name: businessName },
        assistant: {
          firstMessage: `Hi, is this from ${businessName}?`,
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${this.privateKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    return { vapiCallId: response.data.id };
  }

  /**
   * Fetch a single Vapi call by id and translate its status to CallResult.
   * Returns IN_PROGRESS if the call has not ended yet.
   */
  async fetchCallStatus(callId: string): Promise<CallResult> {
    const response = await axios.get(`${this.baseUrl}/call/${callId}`, {
      headers: { Authorization: `Bearer ${this.privateKey}` },
    });
    const call = response.data;

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

    const transcript =
      call.transcript || call.artifact?.transcript || null;
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

  async makeCallWithMessage(
    businessPhone: string,
    businessName: string,
    firstMessage: string
  ): Promise<CallResult> {
    if (!this.privateKey || !this.phoneNumberId) {
      // brand-scrubbed; original cause in err.cause
      throw new Error(
        scrubBrandStrings("Vapi Configuration Missing for this organization.")
      );
    }
    try {
      const formattedPhone = this.formatPhone(businessPhone);
      const response = await axios.post(
        `${this.baseUrl}/call`,
        {
          phoneNumberId: this.phoneNumberId,
          customer: { number: formattedPhone, name: businessName },
          assistant: {
            firstMessage,
            model: {
              provider: "openai",
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a professional caller. Be concise and friendly.",
                },
              ],
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.privateKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      const callId = response.data.id;
      return await this.pollForCompletion(callId);
    } catch (error: any) {
      console.error("[vapi] Call Failed:", redactAxiosError(error));
      return { status: "FAILED", durationSeconds: 0 };
    }
  }

  async makeCall(
    businessPhone: string,
    businessName: string,
    orgConfig: VapiOrgConfig,
    organizationId?: string
  ): Promise<CallResult> {
    if (!this.privateKey || !this.phoneNumberId) {
      // brand-scrubbed; original cause in err.cause
      throw new Error(
        scrubBrandStrings("Vapi Configuration Missing for this organization.")
      );
    }
    try {
      const { vapiCallId } = await this.initiateCall(
        businessPhone,
        businessName,
        orgConfig,
        organizationId
      );
      return await this.pollForCompletion(vapiCallId);
    } catch (error: any) {
      // Quota errors must propagate — never swallow into a FAILED result.
      if (error?.name === "QuotaExceededError") throw error;
      console.error("[vapi] Call Failed:", redactAxiosError(error));
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
        console.error("[vapi] poll error:", redactAxiosError(err));
      }
    }

    return {
      status: "FAILED",
      durationSeconds: 300,
      transcript: "Timeout waiting for call to end.",
    };
  }
}
