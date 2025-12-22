export interface CallResult {
  status: "COMPLETED" | "NO_ANSWER" | "VOICEMAIL" | "FAILED";
  durationSeconds: number;
  transcript?: string;
}

export class MockVapiService {
  async makeCall(
    phoneNumber: string,
    businessName: string
  ): Promise<CallResult> {
    console.log(`\n📞 Dialing ${businessName} (${phoneNumber})...`);

    // Simulate Ringing Delay
    await new Promise((r) => setTimeout(r, 1500));

    const roll = Math.random();

    // 20% Chance of No Answer / Voicemail
    if (roll < 0.2) {
      console.log("❌ No Answer / Voicemail");
      return {
        status: "VOICEMAIL",
        durationSeconds: 30,
      };
    }

    // 80% Chance of Connection
    console.log("✅ Connected! AI Agent speaking...");
    await new Promise((r) => setTimeout(r, 2000)); // Simulate talking time

    return this.generateSimulatedConversation(businessName, roll);
  }

  private generateSimulatedConversation(
    name: string,
    seed: number
  ): CallResult {
    // 30% Rude/Not Interested
    if (seed < 0.5) {
      const transcript = `
      AI: Hi, this is Alex calling from Zenith Solutions. Am I speaking with the owner?
      Lead: Look, I'm really busy right now. Note interested.
      AI: It will only take 30 seconds, we help businesses like ${name} get more clients...
      Lead: I said I'm not interested. Take me off your list. *Click*
      `;
      return { status: "COMPLETED", durationSeconds: 45, transcript };
    }

    // 30% Mild Interest / Busy
    if (seed < 0.8) {
      const transcript = `
      AI: Hi, this is Alex from Zenith Solutions. Is this ${name}?
      Lead: Yes, this is. Who is this?
      AI: I'm calling to see if you have capacity for 5-10 new high-ticket clients next month?
      Lead: Uh, maybe. We are usually booked out, but I'm listening.
      AI: We use an automated AI system to pre-qualify leads. Have you tried automation before?
      Lead: Not really. How much does it cost?
      AI: It depends on volume. Can I send you a one-page summary?
      Lead: Sure, send it to info@${name.replace(/\s/g, "").toLowerCase()}.com.
      AI: Great, I'll send that over. Have a good day.
      `;
      return { status: "COMPLETED", durationSeconds: 120, transcript };
    }

    // 20% High Interest
    const transcript = `
      AI: Hi, calling for ${name}. This is Alex from Zenith.
      Lead: Hi Alex, how can I help?
      AI: I understand you're the top provider in the area. We have a list of qualified leads looking for your exact services.
      Lead: Oh really? We are actually looking to expand right now.
      AI: That's perfect. Our AI verifies their budget before passing them to you.
      Lead: That sounds exactly like what we need. We've been wasting time on tire-kickers.
      AI: Exactly. Would you be open to a 10-minute demo this Thursday?
      Lead: Thursday afternoon works. preferably 2pm.
      AI: Locked in. I'll send the invite.
    `;
    return { status: "COMPLETED", durationSeconds: 180, transcript };
  }
}
