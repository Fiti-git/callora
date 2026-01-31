import * as fs from "fs";
import * as path from "path";

export class LeadFile {
  static saveBeforeCalling(leads: any[], task: string) {
    if (!leads.length) {
      console.warn("⚠️ No leads to write to CSV");
      return;
    }

    const headers = [
      "task",
      "id",
      "name",
      "address",
      "phone",
      "rating",
      "openNow",
    ];

    const rows = leads.map((l) => [
      task,
      l.id ?? "",
      l.name ?? "",
      l.address ?? "",
      l.phone ?? "",
      l.rating ?? "",
      l.openNow ?? "",
    ]);

    const csv =
      headers.join(",") +
      "\n" +
      rows.map((r) => r.map(LeadFile.escape).join(",")).join("\n");

    const filename = `leads-before-calls-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`;

    const outputPath = path.join(process.cwd(), filename);
    fs.writeFileSync(outputPath, csv, "utf8");

    console.log(`📄 CSV saved (before calling): ${outputPath}`);
  }

  private static escape(value: any): string {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
}
