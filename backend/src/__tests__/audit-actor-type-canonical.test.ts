import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { CANONICAL_ACTOR_TYPES } from "../lib/audit.js";

/**
 * Static scan: walk every .ts file under backend/src/routes/ + backend/src/workers/,
 * find every literal `actorType: "..."` occurrence, and assert it's one of
 * the canonical values. Cheap insurance against future drift — adding a
 * fourth value silently would silently drop rows from both the platform
 * audit query and the tenant audit-log endpoint.
 *
 * If you add a new value, update CANONICAL_ACTOR_TYPES in lib/audit.ts and
 * the matching enums in routes/platform/audit.ts + routes/auditLog.ts.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("AuditLog actorType canonicalisation", () => {
  it("every literal actorType in routes/ + workers/ is canonical", () => {
    const root = path.resolve(__dirname, "..");
    const files = [
      ...walk(path.join(root, "routes")),
      ...walk(path.join(root, "workers")),
    ];

    const offenders: { file: string; line: number; value: string }[] = [];
    const re = /actorType\s*:\s*"([^"]+)"/g;
    const allowed = new Set<string>(CANONICAL_ACTOR_TYPES as readonly string[]);

    for (const f of files) {
      const text = readFileSync(f, "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        let m;
        // Reset per-line so we don't carry state across iterations.
        const lineRe = new RegExp(re.source, "g");
        while ((m = lineRe.exec(line))) {
          if (!allowed.has(m[1])) {
            offenders.push({ file: f, line: i + 1, value: m[1] });
          }
        }
      });
    }

    expect(
      offenders,
      `Non-canonical actorType literals found:\n${offenders
        .map((o) => `  ${o.file}:${o.line}  →  "${o.value}"`)
        .join("\n")}`
    ).toEqual([]);
  });
});
