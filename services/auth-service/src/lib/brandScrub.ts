/**
 * Brand-scrub layer — ported subset of
 * backend/src/services/provisioning/brandScrub.ts.
 *
 * Used by /api/me/provisioning-status to guarantee `failureReason` strings
 * surfaced to tenants never contain vendor names.
 */
const BANNED: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bgoogle\s*places\b/gi, replacement: "the lead engine" },
  { pattern: /\belevenlabs\b/gi, replacement: "the dialer" },
  { pattern: /\b11labs\b/gi, replacement: "the dialer" },
  { pattern: /\bdeepgram\b/gi, replacement: "the dialer" },
  { pattern: /\btwilio\b/gi, replacement: "the dialer" },
  { pattern: /\bvapi\b/gi, replacement: "the dialer" },
  { pattern: /\bbland\b/gi, replacement: "the dialer" },
  { pattern: /\bgemini\b/gi, replacement: "the lead engine" },
  { pattern: /\bresend\b/gi, replacement: "the email service" },
];

export function scrubBrandStrings(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { pattern, replacement } of BANNED) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(/(\bthe\s+dialer)(\s+the\s+dialer)+\b/gi, "$1");
  out = out.replace(
    /(\bthe\s+lead\s+engine)(\s+the\s+lead\s+engine)+\b/gi,
    "$1"
  );
  return out;
}
