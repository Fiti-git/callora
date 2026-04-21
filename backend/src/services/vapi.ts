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
  status: "COMPLETED" | "NO_ANSWER" | "VOICEMAIL" | "FAILED";
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
                    "You are Alex from Redot Global. Your goal is to see if the business owner is interested in getting more clients via AI automation. Be professional, concise, and friendly. If they are interested, ask for an email to send details. If they are busy, offer to call back later. If anyone asks for a contact number or email, provide:  8823 9168.",
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
      const formattedPhone = this.formatPhone(businessPhone);
      const systemPrompt = buildSystemPrompt(orgConfig);

      const response = await axios.post(
        `${this.baseUrl}/call`,
        {
          phoneNumberId: this.phoneNumberId,
          customer: {
            number: formattedPhone,
            name: businessName,
          },
          assistant: {
            firstMessage: `Hi, is this from ${businessName}?`,
            model: {
              provider: "openai",
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: systemPrompt,
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

  private async pollForCompletion(callId: string): Promise<CallResult> {
    const maxRetries = 80;
    let attempts = 0;

    while (attempts < maxRetries) {
      const delayMs = attempts < 10 ? 3000 : 5000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempts++;

      try {
        const response = await axios.get(`${this.baseUrl}/call/${callId}`, {
          headers: { Authorization: `Bearer ${this.privateKey}` },
        });

        const call = response.data;
        if (call.status === "ended") {
          const reason = call.endedReason;
          let status: CallResult["status"] = "COMPLETED";

          if (
            reason === "customer-did-not-answer" ||
            reason === "ring-timeout"
          ) {
            status = "NO_ANSWER";
          } else if (reason === "voicemail") {
            status = "VOICEMAIL";
          }

          const transcript =
            call.transcript ||
            call.analysis?.summary ||
            call.artifact?.transcript;

          return {
            status,
            durationSeconds: call.durationSeconds || 0,
            transcript: JSON.stringify(transcript || "No transcript available"),
            vapiCallId: callId,
            cost: call.cost ?? undefined,
            costBreakdown: call.costBreakdown ?? undefined,
          };
        }
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
