import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// This test enforces the platform-owned-keys invariant: no service may
// reference tenant-stored secret fields (apiKey, googleMapsKey, geminiKey,
// vapiKey). Tenant-publishable API key paths under `app/v1/api-keys` are
// allowed (those are the OAuth/PAT-style tenant-issued keys, not vendor
// secrets).

const FORBIDDEN_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "googleMapsKey", re: /\bgoogleMapsKey\b/ },
  { name: "geminiKey", re: /\bgeminiKey\b/ },
  { name: "vapiKey", re: /\bvapiKey\b/ },
  // `apiKey` matches a lot — only flag it when it looks like a Prisma
  // field on the deprecated tenant ApiKey model. Anything containing
  // `apiKey:` as an object key in source code is suspect.
  { name: "apiKey field", re: /\bapiKey\s*[:=]\s*['"`]/ },
];

const SCAN_ROOTS = [
  join(__dirname, "..", "services"),
];

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "__tests__",
  ".turbo",
  ".next",
  "coverage",
]);

const ALLOWED_PATH_PREFIXES = [
  // Tenant-publishable API keys (PAT-style) live here.
  "/app/v1/api-keys/",
  "/api/v1/api-keys/",
];

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".ts") || entry.endsWith(".js")) {
      yield full;
    }
  }
}

function isAllowedPath(p: string): boolean {
  const norm = p.replace(/\\/g, "/");
  return ALLOWED_PATH_PREFIXES.some((prefix) => norm.includes(prefix));
}

describe("no tenant-stored vendor key leakage in services/*", () => {
  it("none of the forbidden secret-field names appear in service code", () => {
    const violations: { file: string; pattern: string; line: number; text: string }[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        if (isAllowedPath(file)) continue;
        const src = readFileSync(file, "utf8");
        const lines = src.split(/\r?\n/);
        for (const { name, re } of FORBIDDEN_PATTERNS) {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comment-only lines and string-literal `// allow:` markers.
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
            if (line.includes("allow-tenant-key")) continue;
            if (re.test(line)) {
              violations.push({
                file: relative(process.cwd(), file),
                pattern: name,
                line: i + 1,
                text: line.trim().slice(0, 200),
              });
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      // Show first 20 violations for clarity.
      const msg = violations
        .slice(0, 20)
        .map((v) => `  ${v.file}:${v.line} [${v.pattern}] ${v.text}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} tenant-key leak(s):\n${msg}\n\n` +
          `Vendor secrets must come from getServiceSecret(...). ` +
          `If a hit is a false positive, add the marker comment "allow-tenant-key" on the same line.`
      );
    }

    expect(violations).toEqual([]);
  });
});
