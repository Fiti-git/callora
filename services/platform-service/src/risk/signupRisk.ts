// Signup risk assessment for Callora. Combines:
//   1. Email reputation heuristic (disposable-domain block-list).
//   2. hCaptcha verification (HCAPTCHA_SECRET via getServiceSecret).
//   3. IP reputation — stub (TODO: IPQualityScore / AbuseIPDB).
//   4. Stripe Radar score hook — placeholder, only fired if a paymentMethodId
//      is supplied. Returns a soft "review" flag when score is high.
//
// Design rules:
//   - Never block on captcha service down. Log + allow + flag for review.
//   - Single composed decision: any block reason → block; else if soft
//     flags >= REVIEW_THRESHOLD → review; else allow.

import { getServiceSecret } from "../config.js";

export type SignupDecision = "allow" | "review" | "block";

export interface SignupRiskInput {
  email: string;
  ip: string;
  captchaToken?: string;
  userAgent?: string;
  paymentMethodId?: string; // optional — for Stripe Radar lookup
}

export interface SignupRiskResult {
  score: number; // 0 (clean) – 100 (definitely block)
  decision: SignupDecision;
  reasons: string[];
}

// Compact, intentionally non-exhaustive list. Real deployments should
// import a maintained list (e.g. disposable-email-domains npm pkg).
const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com",
  "tempmail.com",
  "tempmail.io",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com",
  "dispostable.com",
  "fakeinbox.com",
  "throwawaymail.com",
  "mintemail.com",
  "sharklasers.com",
  "getairmail.com",
  "maildrop.cc",
  "spam4.me",
  "tempr.email",
  "moakt.com",
  "mohmal.com",
  "tempinbox.com",
  "emailondeck.com",
]);

const REVIEW_THRESHOLD = 40;
const BLOCK_THRESHOLD = 70;

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

function looksLikeBurnerLocalPart(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  // Lots of digits or nonsense randomness.
  const digitRatio = (local.match(/\d/g)?.length ?? 0) / Math.max(local.length, 1);
  return local.length >= 12 && digitRatio > 0.5;
}

interface HCaptchaVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  score?: number;
}

async function verifyCaptcha(
  token: string | undefined
): Promise<{ ok: boolean; degraded: boolean; reason?: string }> {
  if (!token) return { ok: false, degraded: false, reason: "captcha_missing" };

  let secret: string;
  try {
    secret = await getServiceSecret("HCAPTCHA_SECRET");
  } catch {
    console.warn(
      "[signupRisk] HCAPTCHA_SECRET not configured — captcha verification skipped (dev mode)."
    );
    return { ok: true, degraded: true };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    const resp = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!resp.ok) {
      console.warn(
        `[signupRisk] hCaptcha returned HTTP ${resp.status} — failing soft (allow + review).`
      );
      return { ok: true, degraded: true, reason: "captcha_service_http_error" };
    }
    const json = (await resp.json()) as HCaptchaVerifyResponse;
    if (!json.success) {
      return {
        ok: false,
        degraded: false,
        reason: `captcha_failed:${(json["error-codes"] ?? []).join(",")}`,
      };
    }
    return { ok: true, degraded: false };
  } catch (err) {
    console.warn(
      "[signupRisk] hCaptcha request threw — failing soft (allow + review).",
      err
    );
    return { ok: true, degraded: true, reason: "captcha_service_unreachable" };
  }
}

// IP reputation stub. TODO: integrate IPQualityScore / AbuseIPDB.
async function ipReputation(_ip: string): Promise<{ score: number; reason?: string }> {
  // Neutral score for now.
  return { score: 0 };
}

// Stripe Radar score hook — currently a placeholder. We don't import the
// Stripe SDK from platform-service to keep the module isolated; billing-
// service owns Stripe. When a paymentMethodId is present we just leave a
// TODO marker so audit-log review can pick it up.
async function stripeRadarScore(
  paymentMethodId: string | undefined
): Promise<{ score: number; reason?: string }> {
  if (!paymentMethodId) return { score: 0 };
  // TODO: call billing-service /internal/stripe/radar-score?pmId=...
  return { score: 0, reason: "radar_not_wired" };
}

export async function assessSignup(
  input: SignupRiskInput
): Promise<SignupRiskResult> {
  const reasons: string[] = [];
  let score = 0;
  let hardBlock = false;

  // --- Email reputation -------------------------------------------------
  const domain = emailDomain(input.email);
  if (!domain) {
    reasons.push("email_malformed");
    hardBlock = true;
    score += 80;
  } else {
    if (DISPOSABLE_DOMAINS.has(domain)) {
      reasons.push(`email_disposable:${domain}`);
      hardBlock = true;
      score += 70;
    }
    if (looksLikeBurnerLocalPart(input.email)) {
      reasons.push("email_local_part_random");
      score += 25;
    }
  }

  // --- Captcha ----------------------------------------------------------
  const captcha = await verifyCaptcha(input.captchaToken);
  if (!captcha.ok) {
    reasons.push(captcha.reason ?? "captcha_invalid");
    hardBlock = true;
    score += 60;
  } else if (captcha.degraded) {
    reasons.push(captcha.reason ?? "captcha_degraded");
    score += 10;
  }

  // --- IP reputation (stub) --------------------------------------------
  const ipRep = await ipReputation(input.ip);
  if (ipRep.score > 0) {
    reasons.push(ipRep.reason ?? `ip_score:${ipRep.score}`);
    score += ipRep.score;
  }

  // --- Stripe Radar (optional) -----------------------------------------
  const radar = await stripeRadarScore(input.paymentMethodId);
  if (radar.score > 0) {
    reasons.push(radar.reason ?? `radar_score:${radar.score}`);
    score += radar.score;
  }

  // --- User-Agent sniff -------------------------------------------------
  if (!input.userAgent || input.userAgent.length < 8) {
    reasons.push("user_agent_missing_or_short");
    score += 15;
  }

  score = Math.min(100, Math.max(0, score));

  let decision: SignupDecision;
  if (hardBlock || score >= BLOCK_THRESHOLD) {
    decision = "block";
  } else if (score >= REVIEW_THRESHOLD) {
    decision = "review";
  } else {
    decision = "allow";
  }

  return { score, decision, reasons };
}
