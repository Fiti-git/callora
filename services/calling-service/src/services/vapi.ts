import axios from "axios";

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

export function buildSystemPrompt(orgConfig: VapiOrgConfig): string {
  if (orgConfig.aiSystemPrompt && orgConfig.aiSystemPrompt.trim().length > 0) {
    return orgConfig.aiSystemPrompt;
  }
  const contactLine = orgConfig.aiCallerPhone
    ? ` If anyone asks for a contact number, provide: ${orgConfig.aiCallerPhone}.`
    : "";
  return `You are ${orgConfig.aiCallerName} from ${orgConfig.aiCallerCompany}. Your goal is to see if the business owner is interested in getting more clients via AI automation. Be professional, concise, and friendly. If they are interested, ask for an email to send details. If they are busy, offer to call back later.${contactLine}`;
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
    orgConfig: VapiOrgConfig
  ): Promise<{ vapiCallId: string }> {
    if (!this.privateKey || !this.phoneNumberId) {
      throw new Error("Vapi Configuration Missing for this organization.");
    }
    const formattedPhone = this.formatPhone(businessPhone);
    const systemPrompt = buildSystemPrompt(orgConfig);

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
      throw new Error("Vapi Configuration Missing for this organization.");
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
      console.error("Vapi Call Failed:", error.response?.data || error.message);
      return { status: "FAILED", durationSeconds: 0 };
    }
  }

  async makeCall(
    businessPhone: string,
    businessName: string,
    orgConfig: VapiOrgConfig
  ): Promise<CallResult> {
    if (!this.privateKey || !this.phoneNumberId) {
      throw new Error("Vapi Configuration Missing for this organization.");
    }
    try {
      const { vapiCallId } = await this.initiateCall(
        businessPhone,
        businessName,
        orgConfig
      );
      return await this.pollForCompletion(vapiCallId);
    } catch (error: any) {
      console.error("Vapi Call Failed:", error.response?.data || error.message);
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
      } catch (err) {
        console.error("Vapi poll error:", err);
      }
    }

    return {
      status: "FAILED",
      durationSeconds: 300,
      transcript: "Timeout waiting for call to end.",
    };
  }
}
