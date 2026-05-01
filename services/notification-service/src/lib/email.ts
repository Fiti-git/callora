import nodemailer, { type Transporter } from "nodemailer";
import { prisma, meterAndCharge, QuotaExceededError } from "@callora/shared";

const FROM = process.env.EMAIL_FROM ?? "Callora <noreply@callora.ai>";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const LOGO_DARK = "https://ik.imagekit.io/z85ct1wzn/callora-logo-dark.png";
export const LOGO_LIGHT = "https://ik.imagekit.io/z85ct1wzn/callora-logo-light.png";
export const LOGO_ICON = "https://ik.imagekit.io/z85ct1wzn/callora-logo-icon.png";

export { FROM, APP_URL };

let _transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host) return null;
  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return _transporter;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { to, subject, html } = args;
  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.warn("[email] Skipped — SMTP_HOST is not set");
      return;
    }
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[email] Sent to=${to} from=${FROM} subject="${subject}" id=${info.messageId}`);
  } catch (err) {
    console.error(`[email] Send failed to=${to} from=${FROM} subject="${subject}":`, err);
    throw err;
  }
}

/**
 * Tenant-scoped suppression check used by email-marketing/automation workers.
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

interface SendTenantEmailOptions {
  organizationId?: string;
  template?: string;
  required?: boolean;
}

/**
 * Tenant-scoped send used by automation/campaign workers. Mirrors the
 * legacy backend `sendEmail(to, subject, html, options)` signature:
 *  - Pre-send suppression check; on hit, write EmailLog + return.
 *  - Pre-send EMAIL quota check; on miss, write EmailLog + return (or
 *    throw if `required`).
 *  - Sends via SMTP and writes a SENT/FAILED EmailLog row.
 */
export async function sendTenantEmail(
  to: string,
  subject: string,
  html: string,
  options: SendTenantEmailOptions = {}
): Promise<void> {
  const { organizationId, template, required = false } = options;

  // Suppression gate.
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
      } catch (err) {
        console.error("[email] EmailLog write failed:", err);
      }
      return;
    }
  } catch (err) {
    console.error("[email] suppression check failed (continuing):", err);
  }

  // Quota gate.
  if (organizationId) {
    try {
      await meterAndCharge(organizationId, "EMAIL", 1);
    } catch (err: any) {
      const quota =
        err instanceof QuotaExceededError || err?.name === "QuotaExceededError";
      if (quota) {
        try {
          await prisma.emailLog.create({
            data: {
              organizationId,
              recipient: to,
              subject,
              template: template ?? null,
              status: "QUOTA_EXCEEDED",
              providerMessageId: null,
              error: err.message,
            },
          });
        } catch (logErr) {
          console.error("[email] EmailLog write failed:", logErr);
        }
        if (required) throw err;
        return;
      }
      if (required) throw err;
      console.error("[email] meter failure (continuing):", err);
    }
  }

  // Send.
  let providerMessageId: string | null = null;
  let status: "SENT" | "FAILED" = "FAILED";
  let errorMsg: string | null = null;
  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.warn("[email] Skipped — SMTP_HOST is not set");
      return;
    }
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    providerMessageId = info.messageId ?? null;
    status = "SENT";
  } catch (err: any) {
    errorMsg = err?.message ?? String(err);
    if (required) throw err;
  } finally {
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
}
