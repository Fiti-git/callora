/**
 * PII redaction helpers used across logs/metrics.
 *
 * Phone: keep last 4 digits, mask the rest -> "+******1234"
 * Email: mask local part -> "***@example.com"
 * Transcript: replace entirely with "[redacted]"
 *
 * Pino's `redact` paths cover known fields automatically; these helpers are
 * for ad-hoc / one-off log lines where the value isn't on a stable key.
 */

export function redactPhone(input: unknown): string {
  if (input == null) return "";
  const s = String(input).trim();
  if (s.length === 0) return "";
  // Preserve a leading '+' if present.
  const leadingPlus = s.startsWith("+") ? "+" : "";
  const digits = s.replace(/\D+/g, "");
  if (digits.length <= 4) return leadingPlus + "*".repeat(digits.length);
  const last4 = digits.slice(-4);
  return leadingPlus + "*".repeat(digits.length - 4) + last4;
}

export function redactEmail(input: unknown): string {
  if (input == null) return "";
  const s = String(input).trim();
  const at = s.indexOf("@");
  if (at <= 0) return "***";
  return "***" + s.slice(at);
}

export function redactTranscript(_input: unknown): string {
  return "[redacted]";
}

/**
 * The pino redact paths reused across all logger instances. Adding new
 * sensitive keys? Add them here so every service inherits the redaction.
 */
export const PINO_REDACT_PATHS: ReadonlyArray<string> = [
  "phone",
  "phoneNumber",
  "to",
  "toNumber",
  "from",
  "fromNumber",
  "*.phone",
  "*.phoneNumber",
  "*.toNumber",
  "*.fromNumber",
  "email",
  "emailAddress",
  "*.email",
  "*.emailAddress",
  "transcript",
  "*.transcript",
  "artifact.transcript",
  "*.artifact.transcript",
  "api_key",
  "apiKey",
  "*.api_key",
  "*.apiKey",
  "password",
  "*.password",
  "secret",
  "*.secret",
  "authorization",
  "headers.authorization",
  "headers.cookie",
];
