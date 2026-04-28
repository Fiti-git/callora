import { Router } from "express";
import { sendEmail } from "../lib/email.js";
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

router.post("/send-email", async (req, res) => {
  const { template, to, data } = req.body ?? {};
  if (!template || !to) {
    return res.status(400).json({ error: "template and to are required" });
  }
  const fn = templates[template];
  if (!fn) {
    return res.status(400).json({ error: `unknown template: ${template}` });
  }
  try {
    const { subject, html } = fn(data ?? {});
    await sendEmail({ to, subject, html });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[notification-service] send-email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router;
