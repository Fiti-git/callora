import { Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { GeminiService } from "../services/gemini.js";
import { sendEmail, APP_URL } from "../lib/email.js";
import { qualifiedLeadEmail } from "../emails/qualifiedLead.js";
import { logger } from "../lib/logger.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import { publishCampaignProgress } from "../lib/queue.js";
import { emitTenantEvent } from "../lib/webhookEmit.js";
import { resolveCredentials, CredentialsUnavailableError } from "../lib/credentials.js";
import {
  debitWithMarkup,
  reconcileCallCost,
  InsufficientCreditsError,
} from "../lib/paygDebit.js";
import { meterAndCharge } from "../lib/quota.js";
import { requireEnv } from "../lib/env.js";

export interface CallCompletedJobData {
  vapiCallId: string;
  callLogId: string;
  leadId: string;
}

/**
 * Runs after the Vapi webhook records a final CallLog. Responsible for:
 *  - Gemini lead qualification on completed calls with a transcript.
 *  - Updating Lead.status / interestScore based on the qualification.
 *  - Sending the qualified-lead email.
 *
 * This used to live inline in campaignWorker but blocked the BullMQ worker for
 * minutes per call. Moving it here means the campaign worker can dispatch many
 * outbound calls quickly while the webhook drives the per-lead state machine.
 */
export async function callCompletedWorker(job: Job<CallCompletedJobData>) {
  const { callLogId, leadId } = job.data;

  const callLog = await prisma.callLog.findUnique({ where: { id: callLogId } });
  if (!callLog) {
    logger.warn({ callLogId }, "callCompleted: CallLog not found");
    return { skipped: true };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { campaign: true, organization: { include: { apiKeys: true } } },
  });
  if (!lead) {
    logger.warn({ leadId }, "callCompleted: Lead not found");
    return { skipped: true };
  }

  const isCompleted = callLog.status === "COMPLETED";
  const newStatus =
    callLog.status === "COMPLETED"
      ? "CALLED" // overwritten below if qualified
      : callLog.status === "NO_ANSWER" || callLog.status === "VOICEMAIL"
      ? "PENDING_RETRY"
      : "CALLED";

  let interestScore = 0;
  let isQualified = false;
  let summary = callLog.summary ?? "";

  // Phase 5 Agent M5 — reconcile Vapi pre-deduct against actual cost.
  // CallLog.cost is in dollars (Float). Convert → cents → reconcile against
  // the $1.50 placeholder reserved by the campaign worker. Skips for
  // BYOK / SUBSCRIPTION orgs.
  try {
    const actualDollars = typeof callLog.cost === "number" ? callLog.cost : 0;
    const actualCents = Math.max(0, Math.round(actualDollars * 100));
    await reconcileCallCost(
      lead.organizationId,
      150, // pre-deducted raw cents
      actualCents,
      callLog.vapiCallId ?? callLog.id,
      { callLogId: callLog.id, leadId: lead.id }
    );
    // Bump the period reporting counter (post-markup spend).
    if (actualCents > 0) {
      try {
        await meterAndCharge(lead.organizationId, "VAPI_SPEND_CENTS", actualCents);
      } catch (err) {
        logger.warn({ err, callLogId }, "[callCompleted] VAPI_SPEND_CENTS bump failed");
      }
    }
  } catch (err: any) {
    logger.error({ err, callLogId }, "[callCompleted] reconcile failed");
    if (sentryEnabled) Sentry.captureException(err);
  }

  if (isCompleted && callLog.transcript) {
    // Phase 5 Agent M5 — pick BYOK vs platform Gemini key.
    let geminiKey: string | null = null;
    try {
      const creds = await resolveCredentials(lead.organizationId, "GEMINI");
      geminiKey = creds.apiKey;
    } catch (err) {
      if (!(err instanceof CredentialsUnavailableError)) throw err;
      logger.warn(
        { err, organizationId: lead.organizationId },
        "[callCompleted] gemini creds unavailable"
      );
    }
    if (geminiKey) {
      try {
        const gemini = new GeminiService(geminiKey);
        const analysis = await gemini.qualifyLead(
          callLog.transcript,
          lead.businessName,
          lead.organizationId
        );
        interestScore = analysis.interestScore ?? 0;
        isQualified = Boolean(analysis.isQualified);
        summary = analysis.summary ?? summary;

        await prisma.callLog.update({
          where: { id: callLog.id },
          data: { summary },
        });

        // Phase 5 Agent M5 — flat-rate debit per qualification on PAYG orgs.
        try {
          const cents = Number(requireEnv("PAYG_GEMINI_CENTS_PER_QUALIFICATION"));
          await debitWithMarkup(
            lead.organizationId,
            "DEBIT_QUALIFICATION",
            Number.isFinite(cents) && cents > 0 ? cents : 1,
            callLog.id,
            { kind: "qualification", callLogId: callLog.id }
          );
        } catch (err: any) {
          if (!(err instanceof InsufficientCreditsError)) {
            logger.warn({ err, callLogId }, "[callCompleted] qualification debit failed");
          }
          // Insufficient credits at qualification time — let the next dispatch
          // handle the org pause; we don't fail the job here.
        }
      } catch (err: any) {
        // Fail loud per project rules — don't fabricate a qualification.
        logger.error({ err: err.message, leadId }, "Gemini qualification failed");
        if (sentryEnabled) Sentry.captureException(err);
        // Still update the lead to CALLED so it doesn't stick on PENDING.
      }
    }
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: isQualified ? "QUALIFIED" : newStatus,
      interestScore,
    },
  });

  if (isQualified && interestScore >= 60) {
    const adminUser = await prisma.user.findFirst({
      where: { organizationId: lead.organizationId, role: "ADMIN" },
    });
    if (adminUser?.email) {
      const leadUrl = `${APP_URL}/leads/${lead.id}`;
      const { subject, html } = qualifiedLeadEmail(
        adminUser.name ?? "",
        {
          businessName: lead.businessName,
          phone: lead.phone ?? "",
          interestScore,
        },
        lead.campaign.name,
        leadUrl
      );
      // Tenant-passive: don't fail the worker if quota is blown.
      await sendEmail(adminUser.email, subject, html, {
        organizationId: lead.organizationId,
        template: "qualifiedLead",
        required: false,
      });
    }
  }

  // Phase 3 Agent 12 — fire tenant webhooks. CALL_COMPLETED for every
  // finished call; LEAD_QUALIFIED additionally when Gemini deemed the lead
  // qualified. Best-effort: emitTenantEvent swallows its own errors.
  await emitTenantEvent(lead.organizationId, "CALL_COMPLETED", {
    callLogId: callLog.id,
    leadId: lead.id,
    status: callLog.status,
    duration: callLog.duration,
    interestScore,
    qualified: isQualified,
  });
  if (isQualified) {
    await emitTenantEvent(lead.organizationId, "LEAD_QUALIFIED", {
      leadId: lead.id,
      businessName: lead.businessName,
      phone: lead.phone,
      interestScore,
      campaignId: lead.campaignId,
    });
  }

  // Real-time progress event for the SSE subscriber on the campaign detail
  // page. Best-effort — pub/sub failures are logged inside the helper.
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
