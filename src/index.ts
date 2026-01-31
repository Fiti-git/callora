import "dotenv/config";

import { GeminiService } from "./services/gemini.js";
import { PlacesService } from "./services/places.js";
import { MockVapiService } from "./services/mock-vapi.js";
import { VapiService } from "./services/vapi.js";
import { LeadFile } from "./utils/csv.js";

import * as fs from "fs";
import * as path from "path";

// --------------------
// Utility Functions
// --------------------

function formatPhoneE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");

  // US numbers only (change if needed)
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length > 10) return `+${digits}`;

  return null;
}

function safeName(name: string): string {
  return name.substring(0, 40);
}

// --------------------
// Main Agent Pipeline
// --------------------

async function main() {
  const userPrompt =
    process.argv[2] || "Find marketing agencies in San Francisco";

  console.log(
    `🤖 \x1b[36mAgent initialized for task:\x1b[0m "${userPrompt}"`
  );

  const gemini = new GeminiService();
  const places = new PlacesService();

  // Decide which Vapi Service to use
  const useRealVapi = !!process.env.VAPI_PRIVATE_KEY;
  const vapi = useRealVapi ? new VapiService() : new MockVapiService();

  console.log(
    useRealVapi
      ? "🎙️ Using REAL Vapi Service"
      : "🎙️ Using MOCK Vapi Service"
  );

  // --------------------
  // 1. Analyze Request
  // --------------------

  console.log("\n🧠 Generating search queries...");
  const queries = await gemini.generateSearchQueries(userPrompt);
  console.log(`🔍 Queries: ${JSON.stringify(queries)}`);

  // --------------------
  // 2. Find + Merge Leads
  // --------------------

  let allLeads: any[] = [];

  for (const q of queries) {
    const leads = await places.findLeads(q);
    allLeads = [...allLeads, ...leads];
  }

  console.log(`📦 Total raw leads collected: ${allLeads.length}`);

  // ✅ FLOW STEP E — SAVE CSV BEFORE CALLING
  LeadFile.saveBeforeCalling(allLeads, userPrompt);

  // --------------------
  // 3. Deduplicate Leads
  // --------------------

  const uniqueLeads = Array.from(
    new Map(allLeads.map((l) => [l.id, l])).values()
  );

  console.log(`📍 Unique leads after dedupe: ${uniqueLeads.length}`);

  // --------------------
  // 4. Filter Callable
  // --------------------

  const callableLeads = uniqueLeads.filter((l) => l.phone);

  console.log(
    `📞 Leads with phone numbers: ${callableLeads.length}`
  );

  if (!callableLeads.length) {
    console.log("❌ No callable leads found. Exiting.");
    return;
  }

  // --------------------
  // 5. Call Loop
  // --------------------

  const reports: any[] = [];
  const leadsToCall = callableLeads.slice(0, 1); // adjust limit if needed

  for (const lead of leadsToCall) {
    const phone = formatPhoneE164(lead.phone);

    if (!phone) {
      console.log("❌ Invalid phone, skipping:", lead.phone);
      continue;
    }

    console.log(`\n📞 Calling ${lead.name} (${phone})`);
    const result = await vapi.makeCall(phone, safeName(lead.name));

    if (result.status === "COMPLETED" && result.transcript) {
      console.log("📝 Analyzing transcript...");
      const analysis = await gemini.qualifyLead(
        result.transcript,
        lead.name
      );

      reports.push({ lead, call: result, analysis });

      console.log(
        `   → Score: ${analysis.interestScore}/10 | ${analysis.sentiment}`
      );
    } else {
      console.log("   → No transcript. Skipping analysis.");
      reports.push({ lead, call: result, analysis: null });
    }
  }

  // --------------------
  // 6. Generate Report
  // --------------------

  generateMarkdownReport(reports, userPrompt);
}

// --------------------
// Markdown Report
// --------------------

function generateMarkdownReport(reports: any[], task: string) {
  const scored = reports.filter((r) => r.analysis);

  const high = scored.filter((r) => r.analysis.interestScore >= 7);
  const medium = scored.filter(
    (r) => r.analysis.interestScore >= 4 && r.analysis.interestScore < 7
  );
  const low = scored.filter((r) => r.analysis.interestScore < 4);

  let md = `# Sales Agent Report

**Task:** ${task}  
**Date:** ${new Date().toLocaleString()}

`;

  md += `## 🎯 High Priority (${high.length})\n`;
  high.forEach((r) => (md += renderLeadBlock(r)));

  md += `\n## ⚠️ Medium Priority (${medium.length})\n`;
  medium.forEach((r) => (md += renderLeadBlock(r)));

  md += `\n## 🗑️ Low Priority (${low.length})\n`;
  low.forEach((r) => (md += renderLeadBlock(r)));

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .split("Z")[0];

  const filename = `leads-report-${timestamp}.md`;
  const outputPath = path.join(process.cwd(), filename);

  fs.writeFileSync(outputPath, md, "utf8");

  console.log(`\n✅ Report saved to ${outputPath}`);
}

function renderLeadBlock(r: any): string {
  return `
### ${r.lead.name}
- Phone: ${r.lead.phone}
- Interest Score: ${r.analysis.interestScore}/10 (${r.analysis.sentiment})
- Summary: ${r.analysis.summary}
- Next Step: ${r.analysis.nextSteps}
- Transcript: "${r.call.transcript
    .trim()
    .substring(0, 100)}..."
---
`;
}

// --------------------
main().catch(console.error);
