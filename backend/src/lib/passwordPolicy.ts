/**
 * Shared password policy. Used by `/auth/register` and `/auth/reset-password`.
 *
 * Rules: min 8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special char.
 *
 * `runChecks` returns each individual rule pass/fail so the API can return a
 * structured `WEAK_PASSWORD` response and the frontend can render a per-rule
 * checklist.
 */
import { z } from "zod";

export interface PasswordChecks {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  digit: boolean;
  special: boolean;
}

const SPECIAL_RE = /[^A-Za-z0-9]/;

export function runChecks(pw: string): PasswordChecks {
  return {
    minLength: pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: SPECIAL_RE.test(pw),
  };
}

export function isStrong(pw: string): boolean {
  const c = runChecks(pw);
  return c.minLength && c.uppercase && c.lowercase && c.digit && c.special;
}

/**
 * Zod schema. Keeps the same `.string()` shape so existing callers that just
 * destructure { password: string } continue to work — but adds a refinement
 * that fails when the per-rule checks don't all pass.
 */
export const passwordSchema = z
  .string()
  .refine(isStrong, { message: "Password does not meet complexity requirements" });

/**
 * Express helper: if the password is weak, write a 400 with the structured
 * `WEAK_PASSWORD` body and return true (caller should `return`). Otherwise
 * returns false.
 */
export function rejectWeakPassword(res: any, pw: string): boolean {
  const checks = runChecks(pw);
  const ok = checks.minLength && checks.uppercase && checks.lowercase && checks.digit && checks.special;
  if (ok) return false;
  res.status(400).json({
    error: "WEAK_PASSWORD",
    message:
      "Password must be at least 8 chars and include upper, lower, digit, and special character.",
    checks,
  });
  return true;
}
