/**
 * CSV-import logic test (no DB). Mirrors the route's parser to assert
 * row-level validation, dedupe behaviour, suppression-skip behaviour,
 * and the 10k row cap.
 */
import { describe, it, expect } from "vitest";
import { parse as parseCsv } from "fast-csv";
import { Readable } from "stream";
import { z } from "zod";

const rowSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(200).optional(),
  lastName: z.string().max(200).optional(),
  source: z.string().max(40).optional(),
});
const MAX_ROWS = 10_000;

interface RunResult {
  inserted: number;
  skipped: number;
  errors: string[];
  aborted: { kind: string } | null;
}

async function run(
  csv: string,
  suppressed: Set<string> = new Set()
): Promise<RunResult> {
  return new Promise((resolve) => {
    let rowIndex = 0;
    const errors: string[] = [];
    const accepted: string[] = [];
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
        errors.push(`row ${rowIndex}: ${r.error.issues[0].message}`);
        return;
      }
      accepted.push(r.data.email.toLowerCase());
    });
    parser.on("end", () => {
      const seen = new Set<string>();
      let inserted = 0;
      let skipped = 0;
      for (const e of accepted) {
        if (suppressed.has(e)) {
          skipped++;
          continue;
        }
        if (seen.has(e)) {
          skipped++;
          continue;
        }
        seen.add(e);
        inserted++;
      }
      resolve({ inserted, skipped, errors, aborted });
    });
    parser.on("error", () => resolve({ inserted: 0, skipped: 0, errors, aborted }));
    Readable.from(csv).pipe(parser);
  });
}

describe("Email list CSV import", () => {
  it("dedupes within the same upload", async () => {
    const csv = ["email", "a@x.com", "b@x.com", "a@x.com"].join("\n");
    const r = await run(csv);
    expect(r.inserted).toBe(2);
    expect(r.skipped).toBe(1);
  });

  it("skips emails already on the suppression list", async () => {
    const csv = ["email", "a@x.com", "b@x.com"].join("\n");
    const r = await run(csv, new Set(["a@x.com"]));
    expect(r.inserted).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("collects invalid rows", async () => {
    const csv = ["email", "a@x.com", "not-an-email", "b@x.com"].join("\n");
    const r = await run(csv);
    expect(r.inserted).toBe(2);
    expect(r.errors.length).toBe(1);
  });

  it("aborts at 10k row cap", async () => {
    const lines = ["email"];
    for (let i = 0; i < 10_500; i++) lines.push(`u${i}@x.com`);
    const r = await run(lines.join("\n"));
    expect(r.aborted).not.toBeNull();
    expect(r.aborted?.kind).toBe("CSV_ROW_LIMIT_EXCEEDED");
  });
});
