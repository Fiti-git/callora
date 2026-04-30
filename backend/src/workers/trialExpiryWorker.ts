import { Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { sendEmail, APP_URL } from "../lib/email.js";
import { trialExpiryEmail } from "../emails/trialExpiry.js";
import { writeAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";

const PAST_DUE_GRACE_DAYS = 14;

/**
 * Daily trial-expiry sweep.
 *
 * 1. Send 7-day and 1-day warnings to TRIALING orgs.
 * 2. Flip orgs whose trial has actually ended (and have no active sub) to PAST_DUE.
 * 3. Flip orgs that have been PAST_DUE for >14 days to CANCELED.
 *
 * Both transitions are recorded to AuditLog with actorType=SYSTEM so the
 * platform admin can see why an org's status changed.
 */
export async function trialExpiryWorker(_job: Job) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  // ---- 1. send warnings (existing behaviour) ----
  const trialing = await prisma.subscription.findMany({
    where: {
      status: "TRIALING",
      trialEndsAt: { gte: now, lte: windowEnd },
    },
    include: {
      organization: { include: { users: { where: { role: "ADMIN" } } } },
    },
  });

  let sent = 0;
  for (const sub of trialing) {
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
    // Tenant-passive: trial-warning shouldn't break the sweep when the
    // org is over its EMAIL quota — the sweep just records QUOTA_EXCEEDED
    // and moves on.
    await sendEmail(admin.email, subject, html, {
      organizationId: sub.organizationId,
      template: "trialExpiry",
      required: false,
    });
    sent++;
  }

  // ---- 2. transition expired trials to PAST_DUE ----
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
    // Skip if Stripe subscription is active (paid customer mid-trial-conversion).
    if (sub.status === "ACTIVE" || sub.status === "TRIALING") continue;
    await prisma.organization.update({
      where: { id: sub.organizationId },
      data: { status: "PAST_DUE" },
    });
    await writeAudit({
      actorType: "SYSTEM",
      actorId: "trialExpiryWorker",
      organizationId: sub.organizationId,
      action: "ORG_STATUS_PAST_DUE",
      target: sub.organizationId,
      metadata: { reason: "trial_expired", trialEndsAt: sub.trialEndsAt },
    });
    pastDued++;
  }

  // ---- 3. PAST_DUE > 14 days -> CANCELED ----
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
    await writeAudit({
      actorType: "SYSTEM",
      actorId: "trialExpiryWorker",
      organizationId: org.id,
      action: "ORG_STATUS_CANCELED",
      target: org.id,
      metadata: { reason: "past_due_grace_expired", graceDays: PAST_DUE_GRACE_DAYS },
    });
    canceled++;
  }

  logger.info(
    { sent, pastDued, canceled },
    "[trial-expiry] sweep complete"
  );
  return { sent, pastDued, canceled };
}
