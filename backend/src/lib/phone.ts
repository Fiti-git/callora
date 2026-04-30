/**
 * Phone normalisation + DNC hashing (Phase 2 Agent 9).
 *
 * normalizeE164(raw) → "+1XXXXXXXXXX" for US numbers, or whatever shape the
 * caller passed in if the input already starts with +.
 *
 * hashPhone(e164) → sha256(DNC_HASH_PEPPER || e164). Pepper is a static
 * platform-wide secret. We deliberately use ONE pepper across all tenants
 * so cross-tenant matches against the platform DNC list still work — a
 * per-org salt would defeat platform-wide DNC entirely.
 */

import crypto from "node:crypto";

export function normalizeE164(raw: string): string {
  if (!raw) return "";
  let p = raw.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.length === 10) return "+1" + p;
  if (p.length === 11 && p.startsWith("1")) return "+" + p;
  return p; // fallback — caller is on the hook for non-US shapes
}

export function getPepper(): string {
  const p = process.env.DNC_HASH_PEPPER;
  if (!p) {
    throw new Error(
      "DNC_HASH_PEPPER is not set. Refusing to compute DNC hashes — set it in env."
    );
  }
  return p;
}

export function hashPhone(e164: string): string {
  const pepper = getPepper();
  return crypto.createHash("sha256").update(`${pepper}|${e164}`).digest("hex");
}

/**
 * Mask a phone for display. Keeps the last 4 digits visible.
 *   "+14155551234" → "+1******1234"
 */
export function maskPhone(e164: string): string {
  if (!e164 || e164.length < 4) return "****";
  const last4 = e164.slice(-4);
  const prefix = e164.slice(0, e164.length - 4).replace(/\d/g, "*");
  return prefix + last4;
}
