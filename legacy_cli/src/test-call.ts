import { VapiService } from "./services/vapi.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const phoneNumber = process.argv[2];

  if (!phoneNumber) {
    console.error("❌ Please provide a phone number.");
    console.log("Usage: npx tsx src/test-call.ts <PHONE_NUMBER>");
    process.exit(1);
  }

  console.log(`🧪 Starting Test Call to ${phoneNumber}...`);

  const vapi = new VapiService();

  try {
    // We pass "Test User" as the name
    const result = await vapi.makeCall(phoneNumber, "Namesh");

    console.log("\n✅ Call Completed.");
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${result.durationSeconds}s`);
    console.log(`Transcript: ${result.transcript}`);
  } catch (error: any) {
    console.error("❌ Test Call Failed:", error);
  }
}

main();
