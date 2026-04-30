import { Router } from "express";
import { sendEmail } from "../lib/email.js";
import { meterAndCharge, QuotaExceededError, prisma } from "@callora/shared";
import { welcomeEmail } from "../emails/welcome.js";
import { qualifiedLeadEmail } from "../emails/qualifiedLead.js";
import { trialExpiryEmail } from "../emails/trialExpiry.js";
import { passwordResetEmail } from "../emails/passwordReset.js";
import { verifyEmail } from "../emails/verifyEmail.js";

const router = Router();

type Rendered = { subject: string; html: string };

const templates: Record<string, (data: any) => Rendered> = {
  // data: { name: string, orgName: string, trialEndDate?: string | Date | null }
  welcome: (data) =>
    welcomeEmail(
      data?.name ?? "",
      data?.orgName ?? "",
      data?.trialEndDate ? new Date(data.trialEndDate) : null
    ),
  // data: { adminName, lead: { businessName, phone, interestScore }, campaignName, leadUrl }
  qualifiedLead: (data) =>
    qualifiedLeadEmail(
      data?.adminName ?? "",
      {
        businessName: data?.lead?.businessName ?? "",
        phone: data?.lead?.phone ?? "",
        interestScore: Number(data?.lead?.interestScore ?? 0),
      },
      data?.campaignName ?? "",
      data?.leadUrl ?? ""
    ),
  // data: { name, daysLeft, upgradeUrl }
  trialExpiry: (data) =>
    trialExpiryEmail(
      data?.name ?? "",
      Number(data?.daysLeft ?? 0),
      data?.upgradeUrl ?? ""
    ),
  // data: { name, resetUrl }
  passwordReset: (data) =>
    passwordResetEmail(data?.name ?? "", data?.resetUrl ?? ""),
  // data: { name?, verifyUrl }
  verifyEmail: (data) =>
    verifyEmail({ name: data?.name ?? "", verifyUrl: data?.verifyUrl ?? "" }),
};

router.get("/templates", (_req, res) => {
  res.json({ templates: Object.keys(templates) });
});

/**
 * POST /internal/send-email
 *
 * Body: { template, to, data, organizationId?, required? }
 *
 * Phase 1 wrap-up Task 3: when `organizationId` is provided we meter the
 * send against the org's monthly EMAIL quota.
 *   - `required: true` → quota failure → 429 with QUOTA_EXCEEDED; nothing sent.
 *   - `required: false` (default for tenant-bound) → quota failure → log
 *     a QUOTA_EXCEEDED EmailLog row and return 200 ok:true,skipped:true.
 *   - No `organizationId` → platform-level email, skip the meter.
 */
router.post("/send-email", async (req, res) => {
  const { template, to, data, organizationId, required } = req.body ?? {};
  if (!template || !to) {
    return res.status(400).json({ error: "template and to are required" });
  }
  const fn = templates[template];
  if (!fn) {
    return res.status(400).json({ error: `unknown template: ${template}` });
  }

  const orgId: string | null = typeof organizationId === "string" ? organizationId : null;
  const { subject, html } = fn(data ?? {});

  // Quota gate (only for tenant-bound).
  if (orgId) {
    try {
      await meterAndCharge(orgId, "EMAIL", 1);
    } catch (err: any) {
      const isQuota =
        err instanceof QuotaExceededError || err?.name === "QuotaExceededError";
      if (isQuota) {
        try {
          await prisma.emailLog.create({
            data: {
              organizationId: orgId,
              recipient: to,
              subject,
              template,
              status: "QUOTA_EXCEEDED",
              providerMessageId: null,
              error: err.message,
            },
          });
        } catch (logErr) {
          console.error("[notification-service] EmailLog write failed:", logErr);
        }
        if (required) {
          return res.status(429).json({
            error: "EMAIL_QUOTA_EXCEEDED",
            kind: "EMAIL",
            current: err.current,
            limit: err.limit,
          });
        }
        return res.json({ ok: true, skipped: true, reason: "QUOTA_EXCEEDED" });
      }
      // Non-quota meter failure: required → 500, passive → continue.
      if (required) {
        console.error("[notification-service] meter failure:", err);
        return res.status(500).json({ error: "Failed to meter email" });
      }
      console.error("[notification-service] meter failure (continuing):", err);
    }
  }

  try {
    await sendEmail({ to, subject, html });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[notification-service] send-email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router;
