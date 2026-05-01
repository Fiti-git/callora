/**
 * Email Campaign worker.
 *
 *   dispatch job → fans out into N batch jobs (100 emails each)
 *   batch job    → renders + sends via Resend.batch.send, writes EmailSend rows
 *
 * Pause-aware: between batches the dispatch job re-reads campaign.status; if
 * PAUSED, it requeues itself with a 30s delay rather than continuing.
 *
 * Quota: meterAndCharge runs per BATCH so quota exhaustion is a clean failure
 * point at a batch boundary.
 */
import type { Job } from "bullmq";
import { Resend } from "resend";
import { prisma, meterAndCharge, QuotaExceededError, logger } from "@callora/shared";
import { emailCampaignQueue } from "../lib/queue.js";
import { renderMergeTags, buildMergeContext } from "../lib/mergeTags.js";
import { isSuppressed } from "../lib/email.js";

const BATCH_SIZE = 100;

interface DispatchJobData {
  campaignId: string;
  organizationId: string;
}
interface BatchJobData {
  campaignId: string;
  organizationId: string;
  emails: string[];
}

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

async function gatherRecipients(
  campaignId: string,
  organizationId: string
): Promise<string[]> {
  const lists = await prisma.emailCampaignList.findMany({
    where: { campaignId },
    select: { listId: true },
  });
  if (!lists.length) return [];
  const members = await prisma.emailRecipientListMember.findMany({
    where: {
      listId: { in: lists.map((l: { listId: string }) => l.listId) },
      unsubscribedAt: null,
    },
    select: { email: true },
  });
  const distinct: string[] = Array.from(
    new Set<string>(
      members.map((m: { email: string }) => m.email.toLowerCase())
    )
  );
  const allowed: string[] = [];
  for (const e of distinct) {
    const sup = await isSuppressed(e, organizationId);
    if (!sup.suppressed) allowed.push(e);
  }
  return allowed;
}

export async function emailCampaignDispatch(
  job: Job<DispatchJobData>
): Promise<void> {
  const { campaignId, organizationId } = job.data;
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) {
    logger.warn({ campaignId }, "[email-campaign] dispatch: campaign not found");
    return;
  }
  if (campaign.status === "PAUSED") {
    await emailCampaignQueue.add("dispatch", job.data, {
      jobId: `dispatch:${campaignId}:${Date.now()}`,
      delay: 30_000,
    });
    return;
  }
  if (campaign.status !== "SENDING") {
    logger.info(
      { campaignId, status: campaign.status },
      "[email-campaign] dispatch: not in SENDING — skip"
    );
    return;
  }

  const recipients = await gatherRecipients(campaignId, organizationId);
  if (!recipients.length) {
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "SENT", sentAt: new Date() },
    });
    return;
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { totalRecipients: recipients.length },
  });

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const slice = recipients.slice(i, i + BATCH_SIZE);
    await emailCampaignQueue.add(
      "batch",
      { campaignId, organizationId, emails: slice } satisfies BatchJobData
    );
  }
}

export async function emailCampaignBatch(job: Job<BatchJobData>): Promise<void> {
  const { campaignId, organizationId, emails } = job.data;

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) return;
  if (campaign.status === "PAUSED" || campaign.status === "FAILED") return;

  try {
    await meterAndCharge(organizationId, "EMAIL", emails.length);
  } catch (err: any) {
    if (
      err instanceof QuotaExceededError ||
      err?.name === "QuotaExceededError"
    ) {
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: "FAILED" },
      });
      for (const e of emails) {
        await prisma.emailSend
          .create({
            data: {
              campaignId,
              organizationId,
              email: e,
              status: "FAILED",
              failedAt: new Date(),
              errorMessage: `quota_exceeded: ${err.message}`,
            },
          })
          .catch(() => {});
      }
      return;
    }
    throw err;
  }

  const contacts = await prisma.contact.findMany({
    where: { organizationId, email: { in: emails } },
    select: {
      id: true,
      email: true,
      businessName: true,
      phone: true,
      address: true,
    },
  });
  type ContactRow = (typeof contacts)[number];
  const contactsByEmail = new Map<string, ContactRow>(
    contacts
      .filter((c: ContactRow) => !!c.email)
      .map((c: ContactRow) => [c.email!.toLowerCase(), c])
  );

  const client = getResend();
  const sentRows: Array<{
    email: string;
    messageId: string | null;
    error: string | null;
    contactId: string | null;
  }> = [];

  if (!client) {
    for (const e of emails) {
      sentRows.push({
        email: e,
        messageId: null,
        error: "RESEND_API_KEY not configured",
        contactId: contactsByEmail.get(e)?.id ?? null,
      });
    }
  } else {
    const FROM = `${campaign.fromName} <${campaign.fromEmail}>`;
    const payload = emails.map((e) => {
      const contact = contactsByEmail.get(e) ?? null;
      const ctx = buildMergeContext({ email: e, contact });
      return {
        from: FROM,
        to: e,
        subject: renderMergeTags(campaign.subject, ctx),
        html: renderMergeTags(campaign.htmlBody, ctx),
        ...(campaign.replyTo ? { reply_to: campaign.replyTo } : {}),
      };
    });

    try {
      const { data, error } = await (client as any).batch.send(payload);
      if (error) {
        for (const e of emails) {
          sentRows.push({
            email: e,
            messageId: null,
            error: (error as any)?.message ?? "batch_failed",
            contactId: contactsByEmail.get(e)?.id ?? null,
          });
        }
      } else {
        const ids: any[] = (data as any)?.data ?? data ?? [];
        emails.forEach((e, i) => {
          sentRows.push({
            email: e,
            messageId: ids?.[i]?.id ?? null,
            error: null,
            contactId: contactsByEmail.get(e)?.id ?? null,
          });
        });
      }
    } catch (err: any) {
      for (const e of emails) {
        sentRows.push({
          email: e,
          messageId: null,
          error: err?.message ?? "send_failed",
          contactId: contactsByEmail.get(e)?.id ?? null,
        });
      }
    }
  }

  let successCount = 0;
  for (const r of sentRows) {
    await prisma.emailSend
      .create({
        data: {
          campaignId,
          organizationId,
          email: r.email,
          contactId: r.contactId,
          status: r.error ? "FAILED" : "SENT",
          providerMessageId: r.messageId,
          sentAt: r.error ? null : new Date(),
          failedAt: r.error ? new Date() : null,
          errorMessage: r.error,
        },
      })
      .catch(() => {});
    if (!r.error) successCount++;
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { totalSent: { increment: successCount } },
  });

  const updated = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  if (
    updated &&
    updated.status === "SENDING" &&
    updated.totalSent >= updated.totalRecipients
  ) {
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "SENT", sentAt: new Date() },
    });
    try {
      const { enqueueAutomationRun } = await import(
        "../routes/emailMarketing.js"
      );
      await enqueueAutomationRun(organizationId, "CAMPAIGN_COMPLETE", {
        data: { campaignId },
      });
    } catch (err) {
      logger.warn({ err }, "[email-campaign] CAMPAIGN_COMPLETE trigger failed");
    }
  }
}
