import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Phase 5 Agent M6 — Brand-scrub CI guard.
 *
 * Static scan of customer-facing surfaces for banned vendor names. The point
 * is to keep the Callora UI and emails free of underlying-vendor disclosure
 * (Vapi / Twilio / Gemini / etc.) — sub-processors are still disclosed in
 * legal files (privacy/terms), which are explicitly allow-listed below.
 *
 * If this test fails: either replace the offending string with a neutral
 * label (see backend/src/services/provisioning/brandScrub.ts replacement
 * map), or — if the reference is technical (an SDK import, type name) —
 * add a precise allow-list entry below.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const SCAN_TARGETS: string[] = [
  // Frontend customer-facing surfaces
  "frontend/src/app",
  "frontend/src/components",
  // Backend transactional emails (rendered in tenant inboxes)
  "backend/src/emails",
];

// Files that are excluded from the scan entirely. Keep this list minimal —
// every entry is a deliberate carve-out, not a "TODO scrub later".
const FILE_ALLOWLIST: ReadonlySet<string> = new Set(
  [
    // Legal sub-processor disclosure — required by law in some jurisdictions.
    // Brand-scrubbing here would actively misinform users.
    "frontend/src/app/privacy/page.tsx",
    "frontend/src/app/terms/page.tsx",
    // BYOK admin-only settings form (admin-internal, not a customer marketing
    // surface). Phase-out tracked in M7.
    "frontend/src/components/settings-form.tsx",
    "frontend/src/app/(dashboard)/settings/page.tsx",
    "frontend/src/app/actions/settings.ts",
    // BYOK manual sync card (admin-only, internal QA).
    "frontend/src/components/vapi-sync-card.tsx",
    "frontend/src/app/actions/vapi-sync.ts",
    // Internal cost-breakdown chart label (admin's own analytics view).
    "frontend/src/app/(dashboard)/analytics/CostBreakdownChart.tsx",
    // Existing marketing pages — phase-out tracked in M7 (marketing rewrite).
    "frontend/src/app/(marketing)/layout.tsx",
    "frontend/src/components/marketing/Features.tsx",
    "frontend/src/components/marketing/FAQ.tsx",
    "frontend/src/components/marketing/HowItWorks.tsx",
    "frontend/src/components/marketing/Hero.tsx",
    // Demo page (sales-controlled) — phase-out tracked in M7.
    "frontend/src/app/(dashboard)/demo/page.tsx",
    "frontend/src/app/(dashboard)/campaigns/new/page.tsx",
  ].map((p) => p.replace(/\\/g, "/"))
);

const BANNED: ReadonlyArray<{ token: string; pattern: RegExp }> = [
  { token: "vapi", pattern: /\bvapi(?:\.ai)?\b/i },
  { token: "twilio", pattern: /\btwilio\b/i },
  { token: "bland", pattern: /\bbland\b/i },
  { token: "deepgram", pattern: /\bdeepgram\b/i },
  { token: "elevenlabs", pattern: /\belevenlabs\b/i },
  { token: "11labs", pattern: /\b11labs\b/i },
  { token: "gemini", pattern: /\bgemini\b/i },
  { token: "google places", pattern: /\bgoogle\s+places\b/i },
  { token: "resend", pattern: /\bresend\b/i },
  { token: "openai", pattern: /\bopenai\b/i },
];

// Substring patterns that are technical references rather than user-facing.
// A line that matches any of these is exempted, even when it includes a
// banned token. Keep these tight and motivated.
const LINE_EXEMPTIONS: ReadonlyArray<{ reason: string; pattern: RegExp }> = [
  // "resend" is also a plain English verb ("resend the verification email").
  // Allow it when used as a verb in user-facing copy or API paths — vendor
  // disclosure would mention "Resend" as a product name, distinguishable by
  // capitalisation context (start-of-sentence / standalone). Conservative:
  // allow any line that says "resend" as part of "resend-verification",
  // "resend verification", "Resend verification email", or comment text.
  { reason: "verb-resend-verification", pattern: /resend[\s-]+(?:the\s+)?(?:verification|verify|confirmation|confirm|email)/i },
  { reason: "verb-resend-button-label", pattern: /["'>]\s*Resend(?:\s+(?:verification|confirmation|email))?\s*[<"']/i },
  { reason: "verb-resend-comment", pattern: /^\s*(?:\/\/|\*|#).*resend/i },
  // SDK / module imports
  { reason: "module-import", pattern: /from\s+["'][^"']+["']/ },
  { reason: "import-statement", pattern: /^\s*import\s+/ },
  // Type-only references like `import type { Stripe } from "stripe";` — kept
  // because the matcher is the import line, not user-facing copy.
];

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as any;
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "dist") continue;
      yield* walk(full);
    } else if (e.isFile()) {
      if (/\.(tsx?|mjs|cjs|js)$/.test(e.name)) yield full;
    }
  }
}

function isExemptLine(line: string): boolean {
  return LINE_EXEMPTIONS.some(({ pattern }) => pattern.test(line));
}

interface Hit {
  file: string;
  line: number;
  token: string;
  text: string;
}

async function scanRepo(): Promise<Hit[]> {
  const hits: Hit[] = [];
  for (const rel of SCAN_TARGETS) {
    const root = path.join(REPO_ROOT, rel);
    for await (const file of walk(root)) {
      const repoRel = path
        .relative(REPO_ROOT, file)
        .replace(/\\/g, "/");
      if (FILE_ALLOWLIST.has(repoRel)) continue;
      const content = await fs.readFile(file, "utf8");
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isExemptLine(line)) continue;
        for (const { token, pattern } of BANNED) {
          if (pattern.test(line)) {
            hits.push({
              file: repoRel,
              line: i + 1,
              token,
              text: line.trim().slice(0, 200),
            });
          }
        }
      }
    }
  }
  return hits;
}

describe("brand-scrub CI guard", () => {
  it("no banned vendor names in customer-facing files", async () => {
    const hits = await scanRepo();
    if (hits.length > 0) {
      const formatted = hits
        .map((h) => `  ${h.file}:${h.line}  [${h.token}]  ${h.text}`)
        .join("\n");
      // eslint-disable-next-line no-console
      console.error(
        `\nBrand-scrub guard found ${hits.length} banned reference(s):\n${formatted}\n`
      );
    }
    expect(hits).toEqual([]);
  });
});
