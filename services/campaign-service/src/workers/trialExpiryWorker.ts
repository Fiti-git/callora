import { Job } from "bullmq";
import { prisma } from "@callora/shared";

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL!;
const APP_URL = process.env.TENANT_APP_ORIGIN ?? "http://localhost:3000";
const PAST_DUE_GRACE_DAYS = 14;

async function audit(
  organizationId: string,
  action: string,
  metadata: Record<string, unknown>
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        actorId: "trialExpiryWorker",
        organizationId,
        action,
        target: organizationId,
        metadata: metadata as any,
      },
    });
  } catch (err) {
    console.error("[trial-expiry] audit write failed:", err);
  }
}

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

  // ---- transition expired trials to PAST_DUE ----
  const expired = await prisma.subscription.findMany({
    where: {
      status: { notIn: ["ACTIVE"] },
      trialEndsAt: { lt: now },
      organization: { status: "TRIAL" },
    },
    include: { organization: true },
  });

  let pastDued = 0;
  for (const sub of expired) {
    if (sub.status === "ACTIVE" || sub.status === "TRIALING") continue;
    await prisma.organization.update({
      where: { id: sub.organizationId },
      data: { status: "PAST_DUE" },
    });
    await audit(sub.organizationId, "ORG_STATUS_PAST_DUE", {
      reason: "trial_expired",
      trialEndsAt: sub.trialEndsAt,
    });
    pastDued++;
  }

  // ---- PAST_DUE > 14 days -> CANCELED ----
  const cutoff = new Date(now.getTime() - PAST_DUE_GRACE_DAYS * 86400000);
  const stalePastDue = await prisma.organization.findMany({
    where: { status: "PAST_DUE", updatedAt: { lt: cutoff } },
    include: { subscription: true },
  });

  let canceled = 0;
  for (const org of stalePastDue) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { status: "CANCELED" },
    });
    if (org.subscription) {
      await prisma.subscription.update({
        where: { id: org.subscription.id },
        data: { status: "CANCELED" },
      });
    }
    await audit(org.id, "ORG_STATUS_CANCELED", {
      reason: "past_due_grace_expired",
      graceDays: PAST_DUE_GRACE_DAYS,
    });
    canceled++;
  }

  console.log(
    `[trial-expiry] sent=${sent} pastDued=${pastDued} canceled=${canceled}`
  );
  return { sent, pastDued, canceled };
}
