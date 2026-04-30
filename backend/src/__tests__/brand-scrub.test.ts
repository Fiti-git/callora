import { describe, it, expect } from "vitest";
import {
  scrubBrandStrings,
  scrubError,
} from "../services/provisioning/brandScrub.js";

/**
 * Phase 5 Agent M3 — brand-scrub unit tests.
 *
 * Logic-only. No DB, no network. The point is to guarantee no banned
 * vendor name leaks into a tenant-facing error string.
 */

const BANNED_TOKENS = [
  "vapi",
  "twilio",
  "bland",
  "deepgram",
  "elevenlabs",
  "11labs",
  "gemini",
  "google places",
  "resend",
];

function containsAnyBanned(s: string): string[] {
  const lc = s.toLowerCase();
  return BANNED_TOKENS.filter((t) => lc.includes(t));
}

describe("scrubBrandStrings", () => {
  it("replaces every banned vendor name case-insensitively", () => {
    const input =
      "Vapi error: 502 from Twilio while ElevenLabs voice loaded with Deepgram";
    const out = scrubBrandStrings(input);
    expect(containsAnyBanned(out)).toEqual([]);
  });

  it("handles 11labs spelled with digits", () => {
    expect(containsAnyBanned(scrubBrandStrings("11Labs voice failed"))).toEqual(
      []
    );
  });

  it("scrubs 'google places' as a phrase", () => {
    const out = scrubBrandStrings("Google Places quota exceeded");
    expect(out.toLowerCase()).not.toContain("google places");
  });

  it("scrubs gemini, bland, resend", () => {
    expect(containsAnyBanned(scrubBrandStrings("Gemini timed out"))).toEqual([]);
    expect(containsAnyBanned(scrubBrandStrings("Bland AI rejected"))).toEqual(
      []
    );
    expect(
      containsAnyBanned(scrubBrandStrings("Resend webhook bad signature"))
    ).toEqual([]);
  });

  it("is idempotent — running twice yields the same string", () => {
    const once = scrubBrandStrings("Vapi error from Twilio");
    const twice = scrubBrandStrings(once);
    expect(twice).toBe(once);
  });

  it("doesn't break sentence flow with banned terms in the middle", () => {
    const out = scrubBrandStrings(
      "Failed to call Vapi API while attempting to dial customer."
    );
    expect(out).toMatch(/Failed to call .* while attempting to dial customer\./);
    expect(containsAnyBanned(out)).toEqual([]);
  });

  it("collapses adjacent dialer placeholders", () => {
    // "Vapi Twilio" -> would naively become "the dialer the dialer"
    const out = scrubBrandStrings("Vapi Twilio outage");
    expect(out).not.toMatch(/the dialer the dialer/);
  });

  it("returns empty input untouched", () => {
    expect(scrubBrandStrings("")).toBe("");
  });
});

describe("scrubError", () => {
  it("returns brand-safe message + code, preserves cause", () => {
    const upstream = new Error("Vapi 500: phone number unavailable on Twilio");
    const safe = scrubError(
      upstream,
      "NUMBER_PROVISION_FAILED",
      "We couldn't activate your business number."
    );
    expect(safe.code).toBe("NUMBER_PROVISION_FAILED");
    expect(safe.message).toBe(
      "We couldn't activate your business number."
    );
    expect(safe.cause).toBe(upstream);
    expect(containsAnyBanned(safe.message)).toEqual([]);
  });

  it("scrubs an axios-like error response data message", () => {
    const upstream = {
      response: { status: 500, data: { message: "Twilio purchase failed" } },
      message: "Request failed",
    };
    const safe = scrubError(upstream, "X", "");
    expect(safe.code).toBe("X");
    expect(containsAnyBanned(safe.message)).toEqual([]);
    expect(safe.cause).toBe(upstream);
  });

  it("falls back to a generic message when nothing is provided", () => {
    const safe = scrubError(undefined, "FALLBACK", "");
    expect(safe.message.length).toBeGreaterThan(0);
    expect(containsAnyBanned(safe.message)).toEqual([]);
  });

  it("scrubs even if fallbackMessage somehow contains a vendor name", () => {
    // Defence in depth — a careless caller passing a vendor-tainted fallback
    // must still get a clean message out.
    const safe = scrubError(new Error("x"), "C", "Vapi was unreachable");
    expect(containsAnyBanned(safe.message)).toEqual([]);
  });
});
