/**
 * Phase 5 Agent M3 — Brand-scrub layer.
 *
 * Every error message that bubbles out of a provisioning helper to a route
 * handler / worker / tenant-facing surface MUST be brand-clean. We never let
 * "Vapi", "Twilio", "Bland", "Deepgram", "ElevenLabs", "Gemini",
 * "Google Places", or "Resend" appear in the string a tenant sees.
 *
 * Internal logs, Sentry events and AuditLog metadata KEEP the real cause —
 * only the bubbled error string is sanitised. This module is the single place
 * the mapping lives so M4 (worker) and M5 (resolver) callers stay consistent.
 */

/**
 * Banned vendor strings, longest-first so multi-word names get matched
 * before their substrings (e.g. "google places" before "google" if we ever
 * add the latter).
 */
const BANNED: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // Calling / dialer providers
  { pattern: /\bgoogle\s*places\b/gi, replacement: "the lead engine" },
  { pattern: /\belevenlabs\b/gi, replacement: "the dialer" },
  { pattern: /\b11labs\b/gi, replacement: "the dialer" },
  { pattern: /\bdeepgram\b/gi, replacement: "the dialer" },
  { pattern: /\btwilio\b/gi, replacement: "the dialer" },
  { pattern: /\bvapi\b/gi, replacement: "the dialer" },
  { pattern: /\bbland\b/gi, replacement: "the dialer" },
  // AI / qualification providers
  { pattern: /\bgemini\b/gi, replacement: "the lead engine" },
  // Email
  { pattern: /\bresend\b/gi, replacement: "the email service" },
];

/**
 * Replace every banned vendor name in `input` with a generic Callora-safe
 * label. Case-insensitive, idempotent (running twice is the same as once).
 */
export function scrubBrandStrings(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { pattern, replacement } of BANNED) {
    out = out.replace(pattern, replacement);
  }
  // Collapse "the dialer the dialer" or similar that can result from
  // adjacent vendor names — keeps the message readable.
  out = out.replace(/(\bthe\s+dialer)(\s+the\s+dialer)+\b/gi, "$1");
  out = out.replace(
    /(\bthe\s+lead\s+engine)(\s+the\s+lead\s+engine)+\b/gi,
    "$1"
  );
  return out;
}

export type BrandSafeError = {
  code: string;
  message: string;
  cause?: unknown;
};

/**
 * Convert any thrown value into a brand-safe { code, message, cause } shape.
 * The original `err` is preserved on `cause` so Sentry / AuditLog still get
 * the truth.
 */
export function scrubError(
  err: unknown,
  fallbackCode: string,
  fallbackMessage: string
): BrandSafeError {
  // axios-style errors carry response.data with the upstream message
  const axiosLike = err as
    | {
        response?: { status?: number; data?: { message?: string } | string };
        message?: string;
      }
    | undefined;

  const upstreamMessage =
    typeof axiosLike?.response?.data === "string"
      ? axiosLike.response.data
      : axiosLike?.response?.data?.message;

  const rawMessage =
    upstreamMessage ||
    (err instanceof Error ? err.message : undefined) ||
    axiosLike?.message;

  // We do NOT use the raw upstream message verbatim — even after scrubbing it
  // can leak vendor-specific phrasing ("phone number not available in this
  // market"). The fallback is the canonical brand-clean line; we only fall
  // back to a scrubbed upstream string if the fallback is empty.
  const message = fallbackMessage
    ? scrubBrandStrings(fallbackMessage)
    : scrubBrandStrings(rawMessage || "Something went wrong.");

  return { code: fallbackCode, message, cause: err };
}
