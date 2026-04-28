import { Job } from "bullmq";
import { prisma } from "@callora/shared";

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL!;
const APP_URL = process.env.TENANT_APP_ORIGIN ?? "http://localhost:3000";

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

    try {
      const resp = await fetch(`${NOTIFICATION_SERVICE_URL}/internal/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "trialExpiry",
          to: admin.email,
          data: {
            name: admin.name ?? "",
            daysLeft,
            upgradeUrl,
          },
        }),
      });
      if (!resp.ok) {
        console.error(
          `[trial-expiry] notification-service returned HTTP ${resp.status} for ${admin.email}`
        );
        continue;
      }
      sent++;
    } catch (err) {
      console.error(`[trial-expiry] email send failed for ${admin.email}:`, err);
    }
  }

  console.log(`[trial-expiry] Sent ${sent} trial expiry emails`);
  return { sent };
}
