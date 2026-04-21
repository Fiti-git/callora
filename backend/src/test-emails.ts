/**
 * Callora — Email Test Script
 * Sends all 4 email templates to a test recipient.
 * Run: npx tsx src/test-emails.ts
 */

import { Resend } from "resend";
import { welcomeEmail } from "./emails/welcome.js";
import { qualifiedLeadEmail } from "./emails/qualifiedLead.js";
import { trialExpiryEmail } from "./emails/trialExpiry.js";
import { passwordResetEmail } from "./emails/passwordReset.js";
import * as dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "onboarding@resend.dev"; // Use until callora.io domain verified
const TO = "redotsmm@gmail.com"; // Resend free tier only allows sending to account owner email
const NAME = "Asfak";

async function send(subject: string, html: string, label: string) {
  console.log(`\n📧 Sending: ${label}...`);
  const { data, error } = await resend.emails.send({ from: FROM, to: TO, subject, html });
  if (error) {
    console.error(`   ❌ Failed: ${JSON.stringify(error)}`);
  } else {
    console.log(`   ✅ Sent — ID: ${data?.id}`);
  }
}

async function main() {
  console.log("===========================================");
  console.log("  Callora Email Test — All 4 Templates");
  console.log(`  To: ${TO}`);
  console.log("===========================================");

  // 1. Welcome Email
  const welcome = welcomeEmail(NAME, "Redot Global", new Date(Date.now() + 14 * 86400000));
  await send(welcome.subject, welcome.html, "Welcome");

  // 2. Qualified Lead Email
  const qualified = qualifiedLeadEmail(
    NAME,
    { businessName: "Pacific Dental Group", phone: "+1 604 555 0192", interestScore: 82 },
    "Vancouver Dentists Q2",
    "http://localhost:3000/leads/test-lead-001"
  );
  await send(qualified.subject, qualified.html, "Qualified Lead");

  // 3. Trial Expiry — 7 days
  const trial7 = trialExpiryEmail(NAME, 7, "http://localhost:3000/billing");
  await send(trial7.subject, trial7.html, "Trial Expiry (7 days)");

  // 4. Password Reset
  const reset = passwordResetEmail(
    NAME,
    "http://localhost:3000/reset-password?token=test-token-abc123"
  );
  await send(reset.subject, reset.html, "Password Reset");

  console.log("\n===========================================");
  console.log("  Done. Check asfak.biz.lk@gmail.com");
  console.log("===========================================\n");
}

main().catch(console.error);
