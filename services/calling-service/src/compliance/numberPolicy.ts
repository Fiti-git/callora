// Number classification for compliance gating.
//
// Pure function: no I/O. Used by `complianceCheck` to decide whether a
// destination number is safe to dial under the org's plan.

export type NumberKind = "standard" | "premium" | "international" | "invalid";

export interface NumberClassification {
  kind: NumberKind;
  countryCode: string; // best-effort ITU country code (e.g. "1", "44") or "" when invalid
}

// US/CA premium and special prefixes that we never dial out to. These charge
// the called party (or the carrier bills back exorbitant per-minute rates).
// Stored as full +1NPA so we can match cheaply against the leading digits.
const NANP_PREMIUM_NPA = new Set<string>([
  "+1900", // premium-rate
  "+1976", // premium-rate (legacy)
  "+1809", // common Caribbean scam-bait (Dominican Republic — international, not US)
  "+1500", // personal communications service (premium)
  "+1700", // inter-exchange carrier
]);

// Known premium / shared-cost prefixes outside NANP. Not exhaustive — we
// default-allow international only when the plan permits it, so this list
// is for clearly never-allowed numbers (regardless of plan).
const GLOBAL_PREMIUM_PREFIXES: ReadonlyArray<string> = [
  "+44906", // UK premium
  "+44907",
  "+44908",
  "+44909",
  "+4990", // DE premium
  "+3989", // IT premium
  "+3399", // FR premium
];

const E164_RE = /^\+[1-9]\d{6,14}$/;

function detectCountryCode(e164: string): string {
  // E.164 country codes are 1–3 digits. Cheap longest-prefix check for the
  // common cases; fall back to the first digit.
  const digits = e164.slice(1);
  if (digits.startsWith("1")) return "1"; // NANP
  if (digits.startsWith("7")) return "7"; // RU/KZ
  // 2-digit codes (subset)
  const twoDigit = digits.slice(0, 2);
  if (
    [
      "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41",
      "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54",
      "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66",
      "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98",
    ].includes(twoDigit)
  ) {
    return twoDigit;
  }
  // Fallback: first three digits
  return digits.slice(0, 3);
}

export function classifyNumber(phoneE164: string): NumberClassification {
  if (!phoneE164 || !E164_RE.test(phoneE164)) {
    return { kind: "invalid", countryCode: "" };
  }
  const country = detectCountryCode(phoneE164);

  if (country === "1") {
    // NANP — check premium NPAs
    const npa = phoneE164.slice(0, 5); // "+1NPA"
    if (NANP_PREMIUM_NPA.has(npa)) {
      return { kind: "premium", countryCode: "1" };
    }
    return { kind: "standard", countryCode: "1" };
  }

  // Non-NANP — check global premium prefixes
  for (const pref of GLOBAL_PREMIUM_PREFIXES) {
    if (phoneE164.startsWith(pref)) {
      return { kind: "premium", countryCode: country };
    }
  }
  return { kind: "international", countryCode: country };
}
