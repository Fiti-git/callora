import { Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { sendEmail, APP_URL } from "../lib/email.js";
import { trialExpiryEmail } from "../emails/trialExpiry.js";

export async function trialExpiryWorker(_job: Job) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  const subs = await prisma.subscription.findMany({
    where: {
      status: "TRIALING",
      trialEndsAt: { gte: now, lte: windowEnd },
    },
    include: {
      organization: { include: { users: { where: { role: "ADMIN" } } } },
    },
  });

  let sent = 0;
  for (const sub of subs) {
    if (!sub.trialEndsAt) continue;
    const daysLeft = Math.ceil(
      (sub.trialEndsAt.getTime() - Date.now()) / 86400000
    );
    if (daysLeft !== 7 && daysLeft !== 1) continue;

    const admin = sub.organization.users[0];
    if (!admin?.email) continue;

    const upgradeUrl = `${APP_URL}/billing`;
    const { subject, html } = trialExpiryEmail(
      admin.name ?? "",
      daysLeft,
      upgradeUrl
    );
    await sendEmail(admin.email, subject, html);
    sent++;
  }

  console.log(`[trial-expiry] Sent ${sent} trial expiry emails`);
  return { sent };
}
