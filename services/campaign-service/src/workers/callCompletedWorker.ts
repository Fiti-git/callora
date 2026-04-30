import { Job } from "bullmq";
import { prisma } from "@callora/shared";
import { publishCampaignProgress } from "../lib/queue.js";

/**
 * Runs after the calling-service Vapi webhook records a final CallLog and
 * enqueues a `callCompleted` job. Responsible for:
 *   - Calling lead-service /internal/qualify on completed calls with a
 *     transcript (Gemini summary + interest score + lead status flip).
 *   - Setting Lead.status to PENDING_RETRY on NO_ANSWER / VOICEMAIL.
 *   - Sending the qualified-lead email via notification-service.
 *
 * This used to live inline in campaignWorker but blocked the BullMQ worker for
 * minutes per call. Moving it here lets the campaign worker dispatch many
 * outbound calls quickly while the webhook drives the per-lead state machine.
 */

const LEAD_SERVICE_URL = process.env.LEAD_SERVICE_URL!;
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL!;
const APP_URL = process.env.TENANT_APP_ORIGIN ?? "http://localhost:3000";

export interface CallCompletedJobData {
  vapiCallId: string;
  callLogId: string;
  leadId: string;
}

interface QualifyResponse {
  interestScore: number;
  summary: string;
  status: "QUALIFIED" | "CALLED";
}

async function sendQualifiedLeadEmail(payload: {
  to: string;
  adminName: string;
  lead: { businessName: string; phone: string; interestScore: number };
  campaignName: string;
  leadUrl: string;
}) {
  try {
    const resp = await fetch(`${NOTIFICATION_SERVICE_URL}/internal/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: "qualifiedLead",
        to: payload.to,
        data: {
          adminName: payload.adminName,
          lead: payload.lead,
          campaignName: payload.campaignName,
          leadUrl: payload.leadUrl,
        },
      }),
    });
    if (!resp.ok) {
      console.error(
        `[callCompletedWorker] qualifiedLead email failed: HTTP ${resp.status}`
      );
    }
  } catch (err) {
    console.error(`[callCompletedWorker] qualifiedLead email error:`, err);
  }
}

export async function callCompletedWorker(job: Job<CallCompletedJobData>) {
  const { callLogId, leadId } = job.data;

  const callLog = await prisma.callLog.findUnique({ where: { id: callLogId } });
  if (!callLog) {
    console.warn(`[callCompletedWorker] CallLog ${callLogId} not found`);
    return { skipped: true };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { campaign: true, organization: true },
  });
  if (!lead) {
    console.warn(`[callCompletedWorker] Lead ${leadId} not found`);
    return { skipped: true };
  }

  const isCompleted = callLog.status === "COMPLETED";

  let interestScore = 0;
  let isQualified = false;

  if (isCompleted && callLog.transcript) {
    try {
      const qResp = await fetch(`${LEAD_SERVICE_URL}/internal/qualify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          organizationId: lead.organizationId,
          transcript: callLog.transcript,
        }),
      });

      if (qResp.ok) {
        const q = (await qResp.json()) as QualifyResponse;
        interestScore = q.interestScore ?? 0;
        isQualified = q.status === "QUALIFIED";

        // lead-service /internal/qualify already updates Lead.status,
        // interestScore, and notes. Mirror its summary onto the CallLog so
        // call detail views show the AI summary inline.
        if (q.summary) {
          await prisma.callLog
            .update({ where: { id: callLog.id }, data: { summary: q.summary } })
            .catch(() => {});
        }
      } else {
        console.error(
          `[callCompletedWorker] /internal/qualify returned ${qResp.status} for lead ${lead.id}`
        );
      }
    } catch (err: any) {
      console.error(
        `[callCompletedWorker] qualify call failed for lead ${lead.id}:`,
        err?.message ?? err
      );
    }
  } else if (!isCompleted) {
    // For NO_ANSWER / VOICEMAIL / FAILED outcomes set retry/called state here
    // since lead-service is not invoked.
    const newStatus =
      callLog.status === "NO_ANSWER" || callLog.status === "VOICEMAIL"
        ? "PENDING_RETRY"
        : "CALLED";
    await prisma.lead
      .update({ where: { id: lead.id }, data: { status: newStatus } })
      .catch(() => {});
  }

  if (isQualified && interestScore >= 60) {
    const adminUser = await prisma.user.findFirst({
      where: { organizationId: lead.organizationId, role: "ADMIN" },
    });
    if (adminUser?.email) {
      const leadUrl = `${APP_URL}/leads/${lead.id}`;
      await sendQualifiedLeadEmail({
        to: adminUser.email,
        adminName: adminUser.name ?? "",
        lead: {
          businessName: lead.businessName,
          phone: lead.phone ?? "",
          interestScore,
        },
        campaignName: lead.campaign?.name ?? "",
        leadUrl,
      });
    }
  }

  if (lead.campaignId) {
    await publishCampaignProgress(lead.campaignId, {
      event: "call-completed",
      campaignId: lead.campaignId,
      leadId: lead.id,
      status: callLog.status,
      qualified: isQualified,
      interestScore,
    });
  }

  return { ok: true, qualified: isQualified };
}
