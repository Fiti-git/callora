import axios from "axios";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import { logger } from "../lib/logger.js";
import { meterAndCharge } from "../lib/quota.js";
import prisma from "../lib/prisma.js";
import { isOnDNC } from "../lib/dnc.js";
import { ConsentRequiredError, DNCBlockedError } from "../lib/complianceErrors.js";
import { scrubBrandStrings } from "./provisioning/brandScrub.js";

export interface CostBreakdown {
  transport?: number;
  stt?: number;
  llm?: number;
  tts?: number;
  vapi?: number;
  total?: number;
}

export interface CallResult {
  status: "PENDING" | "COMPLETED" | "NO_ANSWER" | "VOICEMAIL" | "FAILED";
  durationSeconds: number;
  transcript?: string;
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

/**
 * Redact axios errors before logging — never log full response bodies, headers,
 * or request configs (they may contain Authorization headers / API keys).
 */
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
   * Does NOT poll — the webhook completes the CallLog row asynchronously.
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

    // ----- TCPA compliance gates (Phase 2 Agent 9) -----
    // 1. Per-lead consent + do-not-call. Looked up by phone+org because the
    //    monolith path doesn't always carry leadId — phone is the canonical
    //    business key on Lead-by-call.
    if (organizationId) {
      const lead = await prisma.lead.findFirst({
        where: { phone: businessPhone, organizationId },
        select: { id: true, consentGiven: true, doNotCall: true },
      });
      if (lead) {
        if (lead.doNotCall) throw new ConsentRequiredError("DO_NOT_CALL", lead.id);
        if (!lead.consentGiven) throw new ConsentRequiredError("NO_CONSENT", lead.id);
      }
      // 2. Platform / tenant DNC list.
      const dnc = await isOnDNC(formattedPhone, organizationId);
      if (dnc.onDnc) throw new DNCBlockedError(dnc.source, lead?.id);
    }

    // Meter & charge BEFORE we hit Vapi so a quota-exhausted org doesn't
    // actually dial. Throws QuotaExceededError on overage; the caller
    // (worker / route) must let that propagate.
    if (organizationId) {
      await meterAndCharge(organizationId, "VAPI_CALL", 1);
    }

    try {
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
    } catch (err: any) {
      if (sentryEnabled) {
        Sentry.captureException(err, {
          tags: { component: "vapi", kind: "initiate-call" },
        });
      }
      logger.error(redactAxiosError(err), "Vapi initiateCall failed");
      // brand-scrubbed; original cause in err.cause (Sentry got the real one above)
      const scrubbed = new Error(
        scrubBrandStrings(`Vapi call initiation failed: ${err.message}`)
      );
      (scrubbed as any).cause = err;
      throw scrubbed;
    }
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
                    "You are a professional outbound caller. Be concise and friendly.",
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
      return {
        status: "PENDING",
        durationSeconds: 0,
        vapiCallId: response.data.id,
      };
    } catch (err: any) {
      if (sentryEnabled) {
        Sentry.captureException(err, {
          tags: { component: "vapi", kind: "make-call-with-message" },
        });
      }
      logger.error(redactAxiosError(err), "Vapi makeCallWithMessage failed");
      // brand-scrubbed; original cause in err.cause (Sentry got the real one above)
      const scrubbed = new Error(
        scrubBrandStrings(`Vapi call failed: ${err.message}`)
      );
      (scrubbed as any).cause = err;
      throw scrubbed;
    }
  }

  /**
   * Phase 5 Agent M5 — hosted/PAYG path. Skips buildSystemPrompt and uses a
   * pre-created Vapi assistant id (provisioned per-org). The platform key in
   * `this.privateKey` does the auth.
   */
  async makeCallWithAssistant(
    businessPhone: string,
    businessName: string,
    assistantId: string,
    organizationId?: string
  ): Promise<CallResult> {
    if (!this.privateKey || !this.phoneNumberId) {
      throw new Error(
        scrubBrandStrings("Vapi Configuration Missing for this organization.")
      );
    }
    const formattedPhone = this.formatPhone(businessPhone);

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
      await meterAndCharge(organizationId, "VAPI_CALL", 1);
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/call`,
        {
          phoneNumberId: this.phoneNumberId,
          customer: { number: formattedPhone, name: businessName },
          assistantId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.privateKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      return {
        status: "PENDING",
        durationSeconds: 0,
        vapiCallId: response.data.id,
      };
    } catch (err: any) {
      if (sentryEnabled) {
        Sentry.captureException(err, {
          tags: { component: "vapi", kind: "make-call-with-assistant" },
        });
      }
      logger.error(redactAxiosError(err), "Vapi makeCallWithAssistant failed");
      const scrubbed = new Error(
        scrubBrandStrings(`Vapi call initiation failed: ${err.message}`)
      );
      (scrubbed as any).cause = err;
      throw scrubbed;
    }
  }

  /**
   * Fire-and-forget: initiate the call and return immediately with a PENDING
   * CallResult containing the vapiCallId. The webhook handler is responsible
   * for transitioning the resulting CallLog to COMPLETED/FAILED.
   */
  async makeCall(
    businessPhone: string,
    businessName: string,
    orgConfig: VapiOrgConfig,
    organizationId?: string
  ): Promise<CallResult> {
    const { vapiCallId } = await this.initiateCall(
      businessPhone,
      businessName,
      orgConfig,
      organizationId
    );
    return {
      status: "PENDING",
      durationSeconds: 0,
      vapiCallId,
    };
  }
}
