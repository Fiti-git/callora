import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

export interface CallResult {
  status: "COMPLETED" | "NO_ANSWER" | "VOICEMAIL" | "FAILED";
  durationSeconds: number;
  transcript?: string;
}

export class VapiService {
  private baseUrl = "https://api.vapi.ai";
  private privateKey: string;
  private phoneNumberId: string;

  constructor() {
    this.privateKey = process.env.VAPI_PRIVATE_KEY || "";
    this.phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || "";

    if (!this.privateKey) console.error("❌ Missing VAPI_PRIVATE_KEY");
    if (!this.phoneNumberId) console.error("❌ Missing VAPI_PHONE_NUMBER_ID");
  }

  async makeCall(
    customerPhone: string,
    customerName: string
  ): Promise<CallResult> {
    if (!this.privateKey || !this.phoneNumberId) {
      throw new Error("Vapi Configuration Missing");
    }

    console.log(
      `📡 Vapi: Initiating Real Call to ${customerName} (${customerPhone})...`
    );

    try {
      // 1. Trigger the Call
      const response = await axios.post(
        `${this.baseUrl}/call`,
        {
          phoneNumberId: this.phoneNumberId,
          customer: {
            number: customerPhone,
            name: customerName,
          },
          // Standard "Appointment Setter" Assistant
          assistant: {
            firstMessage: `Hi, is this ${customerName}?`,
            model: {
              provider: "openai",
              model: "gpt-4o-mini", // Cost effective, fast
              messages: [
                {
                  role: "system",
                  content:
                    "You are Alex from Redot Global. Your goal is to see if the business owner is interested in getting more clients via AI automation. Be professional, concise, and friendly. If they are interested, ask for an email to send details. If they are busy, offer to call back later.",
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
      console.log(
        `   > Call Started. ID: ${callId}. Waiting for completion...`
      );

      // 2. Poll for Status
      return await this.pollForCompletion(callId);
    } catch (error: any) {
      console.error(
        "❌ Vapi Call Failed:",
        error.response?.data || error.message
      );
      return { status: "FAILED", durationSeconds: 0 };
    }
  }

  private async pollForCompletion(callId: string): Promise<CallResult> {
    const maxRetries = 60; // 5 minutes max
    let attempts = 0;

    while (attempts < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s
      attempts++;

      try {
        const response = await axios.get(`${this.baseUrl}/call/${callId}`, {
          headers: { Authorization: `Bearer ${this.privateKey}` },
        });

        const call = response.data;
        // console.log(`   > Status: ${call.status} (${call.endedReason || "Active"})`);

        if (call.status === "ended") {
          return this.processEndedCall(call);
        }
      } catch (err) {
        console.warn("   > Error polling status (retrying)...");
      }
    }

    return {
      status: "FAILED",
      durationSeconds: 300,
      transcript: "Timeout waiting for call to end.",
    };
  }

  private processEndedCall(callData: any): CallResult {
    const reason = callData.endedReason;

    // Map Vapi reasons to our simple status
    let status: CallResult["status"] = "COMPLETED";

    if (reason === "customer-did-not-answer" || reason === "ring-timeout") {
      status = "NO_ANSWER";
    } else if (reason === "voicemail") {
      status = "VOICEMAIL";
    }

    // Extract transcript
    const transcript =
      callData.transcript ||
      callData.analysis?.summary ||
      callData.artifact?.transcript;

    console.log(
      `✅ Call Ended. Reason: ${reason}. Duration: ${
        callData.durationSeconds || 0
      }s`
    );

    return {
      status,
      durationSeconds: callData.durationSeconds || 0,
      transcript: JSON.stringify(transcript || "No transcript available"),
    };
  }
}
