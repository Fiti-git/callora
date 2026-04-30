import { Resend } from "resend";
import jwt from "jsonwebtoken";
import prisma from "./prisma.js";
import { Sentry, sentryEnabled } from "./sentry.js";
import { meterAndCharge, QuotaExceededError } from "./quota.js";
import { debitWithMarkup, InsufficientCreditsError } from "./paygDebit.js";
import { requireEnv } from "./env.js";

const FROM = process.env.FROM_EMAIL ?? "Callora <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TENANT_ORIGIN = process.env.TENANT_APP_ORIGIN ?? "http://localhost:3000";

export const LOGO_DARK  = "https://ik.imagekit.io/z85ct1wzn/callora-logo-dark.png";
export const LOGO_LIGHT = "https://ik.imagekit.io/z85ct1wzn/callora-logo-light.png";
export const LOGO_ICON  = "https://ik.imagekit.io/z85ct1wzn/callora-logo-icon.png";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export { FROM, APP_URL };

export interface SendEmailOptions {
  organizationId?: string | null;
  template?: string;
  required?: boolean;
}

/**
 * Check tenant + platform suppression list for a recipient.
 * Returns the matching reason if suppressed, otherwise null.
 */
export async function isSuppressed(
  email: string,
  orgId: string | null
): Promise<{ suppressed: boolean; reason?: string }> {
  const lowered = email.toLowerCase();
  const row = await prisma.emailSuppression.findFirst({
    where: {
      email: lowered,
      OR: [{ organizationId: orgId ?? undefined }, { organizationId: null }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { suppressed: false };
  return { suppressed: true, reason: row.reason };
}

function buildUnsubToken(emailLogId: string | null, orgId: string | null, recipient: string): string | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return jwt.sign({ emailLogId, orgId, recipient: recipient.toLowerCase() }, secret, {
    expiresIn: "180d",
  });
}

/**
 * Send an outbound email via Resend with TCPA/CAN-SPAM compliance:
 *  - Pre-send suppression check; on hit, write EmailLog with status=SUPPRESSED
 *    and return WITHOUT calling Resend.
 *  - Inject `List-Unsubscribe` + `List-Unsubscribe-Post` headers pointing at
 *    the public unsubscribe endpoint. Token is signed with NEXTAUTH_SECRET.
 *  - Pre-send EMAIL quota check (existing behaviour).
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions = {}
): Promise<void> {
  const { organizationId, template, required = false } = options;
  let status: "SENT" | "FAILED" | "QUOTA_EXCEEDED" | "SUPPRESSED" = "FAILED";
  let providerMessageId: string | null = null;
  let errorMsg: string | null = null;

  // ----- Suppression gate (Phase 2 Agent 9) -----
  try {
    const sup = await isSuppressed(to, organizationId ?? null);
    if (sup.suppressed) {
      try {
        await prisma.emailLog.create({
          data: {
            organizationId: organizationId ?? null,
            recipient: to,
            subject,
            template: template ?? null,
            status: "SUPPRESSED",
            providerMessageId: null,
            error: `suppressed:${sup.reason}`,
          },
        });
      } catch (logErr) {
        console.error("[email] EmailLog write failed:", logErr);
      }
      console.warn(`[email] Skipped — recipient ${to} is on suppression list (${sup.reason})`);
      return;
    }
  } catch (err) {
    console.error("[email] suppression check failed (continuing):", err);
  }

  // ----- Quota gate -----
  if (organizationId) {
    try {
      await meterAndCharge(organizationId, "EMAIL", 1);
    } catch (err: any) {
      const isQuota =
        err instanceof QuotaExceededError || err?.name === "QuotaExceededError";
      if (isQuota) {
        status = "QUOTA_EXCEEDED";
        errorMsg = err.message;
        try {
          await prisma.emailLog.create({
            data: {
              organizationId,
              recipient: to,
              subject,
              template: template ?? null,
              status,
              providerMessageId: null,
              error: errorMsg,
            },
          });
        } catch (logErr) {
          console.error("[email] EmailLog write failed:", logErr);
        }
        if (required) throw err;
        console.warn(`[email] Skipped due to EMAIL quota for org=${organizationId} subject="${subject}"`);
        return;
      }
      if (required) throw err;
      console.error("[email] meterAndCharge non-quota error (continuing):", err);
    }

    // Phase 5 Agent M5 — flat-rate PAYG debit per email send. No-op for
    // BYOK / SUBSCRIPTION orgs. Insufficient credits during a non-required
    // send is logged and the email is dropped; for `required` it throws so
    // the caller (e.g. password reset) can show a brand-clean error.
    try {
      const cents = Number(requireEnv("PAYG_EMAIL_CENTS_PER_SEND"));
      await debitWithMarkup(
        organizationId,
        "DEBIT_EMAIL",
        Number.isFinite(cents) && cents > 0 ? cents : 1,
        undefined,
        { template: template ?? null, recipient: to.toLowerCase() }
      );
    } catch (err: any) {
      if (err instanceof InsufficientCreditsError) {
        if (required) throw err;
        console.warn(
          `[email] Skipped due to INSUFFICIENT_CREDITS for org=${organizationId} subject="${subject}"`
        );
        return;
      }
      console.error("[email] paygDebit error (continuing):", err);
    }
  }

  // Pre-create an EmailLog row (incomplete) so the unsub token can reference its id.
  // Actually — easier to compute token without an id (signed JWT carries recipient + orgId).
  const token = buildUnsubToken(null, organizationId ?? null, to);
  const unsubUrl = token ? `${TENANT_ORIGIN}/api/email/unsubscribe?t=${encodeURIComponent(token)}` : null;
  const headers: Record<string, string> = {};
  if (unsubUrl) {
    headers["List-Unsubscribe"] = `<${unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const client = getResend();
    if (!client) {
      console.warn("[email] Skipped — RESEND_API_KEY is not set");
      errorMsg = "RESEND_API_KEY not configured";
    } else {
      const { data, error } = await client.emails.send({ from: FROM, to, subject, html, headers });
      if (error) {
        errorMsg = (error as any)?.message ?? JSON.stringify(error);
        if (sentryEnabled) {
          Sentry.captureException(new Error(`Resend rejected: ${errorMsg}`), {
            tags: { component: "email", kind: "resend-send" },
          });
        }
        console.error(`[email] Resend rejected to=${to} from=${FROM} subject="${subject}":`, error);
      } else {
        status = "SENT";
        providerMessageId = data?.id ?? null;
        console.log(`[email] Sent to=${to} from=${FROM} subject="${subject}" id=${data?.id}`);
      }
    }
  } catch (err: any) {
    errorMsg = err?.message ?? String(err);
    if (sentryEnabled) {
      Sentry.captureException(err, {
        tags: { component: "email", kind: "resend-send-throw" },
      });
    }
    console.error(`[email] Send failed to=${to} from=${FROM} subject="${subject}":`, err);
  }

  try {
    await prisma.emailLog.create({
      data: {
        organizationId: organizationId ?? null,
        recipient: to,
        subject,
        template: template ?? null,
        status,
        providerMessageId,
        error: errorMsg,
      },
    });
  } catch (logErr) {
    console.error("[email] EmailLog write failed:", logErr);
  }
}
