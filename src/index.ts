import { GeminiService } from "./services/gemini.js";
import { PlacesService } from "./services/places.js";
import { MockVapiService } from "./services/mock-vapi.js";
import { VapiService } from "./services/vapi.js";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const userPrompt =
    process.argv[2] || "Find marketing agencies in San Francisco";
  console.log(`🤖 \x1b[36mAgent initialized for task:\x1b[0m "${userPrompt}"`);

  const gemini = new GeminiService();
  const places = new PlacesService();

  // Decide which Vapi Service to use
  const useRealVapi = !!process.env.VAPI_PRIVATE_KEY;
  const vapi = useRealVapi ? new VapiService() : new MockVapiService();

  if (useRealVapi) {
    console.log("🎙️ \x1b[35mUsing REAL Vapi Service for calls.\x1b[0m");
  } else {
    console.log("🎙️ \x1b[33mUsing MOCK Vapi Service (Simulated).\x1b[0m");
  }

  // 1. Analyze Request
  console.log("\n🧠 Asking Gemini to devise a search strategy...");
  const queries = await gemini.generateSearchQueries(userPrompt);
  console.log(`🔍 Search Queries: ${JSON.stringify(queries)}`);

  // 2. Find Leads
  let allLeads: any[] = [];
  for (const q of queries) {
    const leads = await places.findLeads(q);
    allLeads = [...allLeads, ...leads];
  }

  // Deduplicate by ID
  const uniqueLeads = Array.from(
    new Map(allLeads.map((item) => [item.id, item])).values()
  );
  console.log(`📍 Found ${uniqueLeads.length} unique leads.`);

  // 3. Filter Leads without Phones
  const callableLeads = uniqueLeads.filter((l) => l.phone);
  console.log(
    `📞 Identifed ${callableLeads.length} leads with phone numbers to call.`
  );

  if (callableLeads.length === 0) {
    console.log("❌ No callable leads found. Exiting.");
    return;
  }

  const reports: any[] = [];

  // Limit to first 3 to save time/mock-space, or remove limit for full run
  const leadsToCall = callableLeads.slice(0, 5);

  // 4. Call Loop
  for (const lead of leadsToCall) {
    const result = await vapi.makeCall(lead.phone!, lead.name);

    if (result.status === "COMPLETED" && result.transcript) {
      console.log("📝 Analyzing conversation...");
      const analysis = await gemini.qualifyLead(result.transcript, lead.name);

      reports.push({
        lead,
        call: result,
        analysis,
      });
      console.log(
        `   > Priority: ${analysis.interestScore}/10 | Sentiment: ${analysis.sentiment}`
      );
    } else {
      console.log("   > Skipped analysis (No transcript)");
    }
  }

  // 5. Generate Report
  generateMarkdownReport(reports, userPrompt);
}

function generateMarkdownReport(reports: any[], task: string) {
  const highPriority = reports.filter((r) => r.analysis.interestScore >= 7);
  const mediumPriority = reports.filter(
    (r) => r.analysis.interestScore >= 4 && r.analysis.interestScore < 7
  );
  const lowPriority = reports.filter((r) => r.analysis.interestScore < 4);

  let md = `# Sales Agent Report\n\n**Task:** ${task}\n**Date:** ${new Date().toLocaleString()}\n\n`;

  md += `## 🎯 High Priority Leads (${highPriority.length})\n`;
  highPriority.forEach((r) => (md += renderLeadBlock(r)));

  md += `\n## ⚠️ Medium Priority (${mediumPriority.length})\n`;
  mediumPriority.forEach((r) => (md += renderLeadBlock(r)));

  md += `\n## 🗑️ Low Priority (${lowPriority.length})\n`;
  lowPriority.forEach((r) => (md += renderLeadBlock(r)));

  const outputPath = path.join(process.cwd(), "leads-report.md");
  fs.writeFileSync(outputPath, md);
  console.log(
    `\n\n✅ \x1b[32mWORK COMPLETE. Report saved to: ${outputPath}\x1b[0m`
  );
}

function renderLeadBlock(r: any): string {
  return `
### ${r.lead.name}
- **Phone:** ${r.lead.phone}
- **Interest Score:** **${r.analysis.interestScore}/10** (${
    r.analysis.sentiment
  })
- **Summary:** ${r.analysis.summary}
- **Next Step:** ${r.analysis.nextSteps}
- *Transcript Snippet:* "${r.call.transcript.trim().substring(0, 100)}..."
---
`;
}

main().catch(console.error);
