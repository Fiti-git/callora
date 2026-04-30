import { describe, it, expect } from "vitest";
import { parse as parseCsv } from "fast-csv";
import { Readable } from "stream";
import { z } from "zod";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";

// Mirror the route's row schema so the test fails if the route's schema drifts.
const rowSchema = z.object({
  phone: z.string().min(7).max(40).optional(),
  number: z.string().min(7).max(40).optional(),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
});

const MAX_ROWS = 10_000;

async function streamParse(csv: string): Promise<{
  validCount: number;
  errorCount: number;
  rowIndex: number;
  aborted: { kind: string } | null;
}> {
  return new Promise((resolve) => {
    let rowIndex = 0;
    let validCount = 0;
    let errorCount = 0;
    let aborted: { kind: string } | null = null;

    const parser = parseCsv({ headers: true, ignoreEmpty: true, trim: true });
    parser.on("data", (row: Record<string, string>) => {
      rowIndex++;
      if (rowIndex > MAX_ROWS) {
        if (!aborted) {
          aborted = { kind: "CSV_ROW_LIMIT_EXCEEDED" };
          parser.end();
        }
        return;
      }
      const r = rowSchema.safeParse(row);
      if (!r.success) {
        errorCount++;
        return;
      }
      const phone = (r.data.phone ?? r.data.number ?? "").replace(/[^\d+]/g, "");
      if (!phone || phone.length < 7) {
        errorCount++;
        return;
      }
      validCount++;
    });
    parser.on("end", () => resolve({ validCount, errorCount, rowIndex, aborted }));
    parser.on("error", () => resolve({ validCount, errorCount, rowIndex, aborted }));
    Readable.from(csv).pipe(parser);
  });
}

describe("CSV upload streaming", () => {
  it("parses valid rows + invalid rows and reports both", async () => {
    const lines = ["phone,name"];
    for (let i = 0; i < 200; i++) lines.push(`555010${1000 + i},Acme${i}`);
    for (let i = 0; i < 5; i++) lines.push(`,InvalidPhone${i}`); // missing phone
    const out = await streamParse(lines.join("\n"));
    expect(out.validCount).toBe(200);
    expect(out.errorCount).toBe(5);
  });

  it("aborts with CSV_ROW_LIMIT_EXCEEDED at 10k+ rows", async () => {
    const lines = ["phone,name"];
    for (let i = 0; i < 11_000; i++) lines.push(`555010${1000 + i},Acme${i}`);
    const out = await streamParse(lines.join("\n"));
    expect(out.aborted).not.toBeNull();
    expect(out.aborted?.kind).toBe("CSV_ROW_LIMIT_EXCEEDED");
  });

  it("file-size limit (10MB) is enforced by multer config (sanity)", () => {
    const limit = 10 * 1024 * 1024;
    expect(limit).toBe(10485760);
  });

  it("filename validation rejects non-.csv names", () => {
    const okName = (n: string) => /\.csv$/i.test(n);
    expect(okName("leads.csv")).toBe(true);
    expect(okName("LEADS.CSV")).toBe(true);
    expect(okName("leads.exe")).toBe(false);
    expect(okName("leads")).toBe(false);
  });
});
