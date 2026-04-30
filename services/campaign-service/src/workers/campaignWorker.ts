import { Job } from "bullmq";
import { prisma, assertWithinQuota } from "@callora/shared";
import { redisConnection, publishCampaignProgress, callQueue } from "../lib/queue.js";
import {
  isWithinAllowedWindow,
  nextAllowedWindow,
  inferStateFromAreaCode,
} from "../lib/callWindow.js";

/**
 * Fire-and-forget campaign worker.
 *
 * Per lead:
 *   1. Check quota and cancellation flag.
 *   2. POST to calling-service /internal/call to start the Vapi call.
 *      calling-service creates a CallLog row keyed on vapiCallId. We upsert
 *      the same row defensively in case calling-service was restarted between
 *      placing the call and writing the row.
 *   3. Mark the Lead as CALLED + bump callAttempts.
 *   4. Move on to the next lead. We do NOT poll — the Vapi webhook drives
 *      completion via a `callCompleted` BullMQ job consumed by
 *      callCompletedWorker (Gemini summary, qualified-lead email, etc.).
 *
 * Preserved semantics from the previous polling implementation:
 *   - Quota exhaustion → campaign status PAUSED_QUOTA, return early.
 *   - Cancellation flag in Redis → campaign status CANCELLED, return early.
 *   - Missing platform Vapi credentials → campaign status FAILED.
 *   - Per-lead failures are isolated; the lead is marked FAILED and the
 *     worker continues with the rest of the campaign.
 */

const CALLING_SERVICE_URL = process.env.CALLING_SERVICE_URL!;

// Platform-owned infrastructure keys. Tenants no longer supply Vapi/Gemini/
// Google Maps credentials — Callora is fully managed.
const VAPI_KEY = process.env.VAPI_PRIVATE_KEY!;
const VAPI_PHONE_ID = process.env.VAPI_PHONE_NUMBER_ID!;

export interface CampaignCallJobData {
  campaignId: string;
  organizationId: string;
  leadIds: string[];
}

interface InitiateCallResponse {
  callLogId: string;
  vapiCallId: string;
}

export async function campaignWorker(job: Job<CampaignCallJobData>) {
  const { campaignId, organizationId, leadIds } = job.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { organization: true },
  });

  if (!campaign || campaign.organizationId !== organizationId) {
    throw new Error(`Campaign ${campaignId} not found for org ${organizationId}`);
  }

  const org = campaign.organization;

  if (!VAPI_KEY || !VAPI_PHONE_ID) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    throw new Error(
      "Platform Vapi credentials are not configured (VAPI_PRIVATE_KEY / VAPI_PHONE_NUMBER_ID)"
    );
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "RUNNING" },
  });

  try {
    for (let index = 0; index < leadIds.length; index++) {
      const leadId = leadIds[index];

      try {
        await assertWithinQuota(organizationId, "call");
      } catch (quotaErr: any) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: "PAUSED_QUOTA" },
        });
        console.warn(
          `Campaign ${campaignId} paused at lead ${index}: ${quotaErr.message}`
        );
        return { status: "PAUSED_QUOTA", processed: index };
      }

      const cancelled = await redisConnection.sismember(
        "cancelled_campaigns",
        campaignId
      );
      if (cancelled) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: "CANCELLED" },
        });
        await redisConnection.srem("cancelled_campaigns", campaignId);
        return { status: "CANCELLED", processed: index };
      }

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead || !lead.phone) {
        continue;
      }

      // ----- Call-window enforcement (Phase 2 Agent 9) -----
      const state = lead.state ?? inferStateFromAreaCode(lead.phone) ?? null;
      if (!isWithinAllowedWindow(state)) {
        const next = nextAllowedWindow(state);
        const delayMs = Math.max(1, next.getTime() - Date.now());
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "PENDING_CALL_WINDOW", nextCallAt: next },
        });
        await callQueue.add(
          "campaign-call",
          { campaignId, organizationId, leadIds: [lead.id] },
          { delay: delayMs }
        );
        await prisma.auditLog.create({
          data: {
            actorType: "SYSTEM",
            actorId: "campaign-worker",
            organizationId,
            targetOrganizationId: organizationId,
            action: "CALL_DEFERRED_WINDOW",
            entity: "Lead",
            entityId: lead.id,
            metadata: { state, nextCallAt: next.toISOString() } as any,
          },
        });
        continue;
      }

      try {
        // Initiate the Vapi call via calling-service. Vapi credentials live
        // on calling-service; we no longer forward them per-call.
        const startResp = await fetch(`${CALLING_SERVICE_URL}/internal/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            organizationId,
            aiCallerName: org.aiCallerName,
            aiCallerCompany: org.aiCallerCompany,
            aiCallerPhone: org.aiCallerPhone,
            aiSystemPrompt: org.aiSystemPrompt ?? undefined,
          }),
        });

        if (startResp.status === 451) {
          // Compliance block (consent missing, DNC). Per-lead skip — do NOT
          // pause the campaign, do NOT count against quota.
          let body: any = {};
          try { body = await startResp.json(); } catch { /* ignore */ }
          const isDnc = body?.error === "dnc_blocked";
          const leadStatus = isDnc ? "SKIPPED_DNC" : "SKIPPED_NO_CONSENT";
          const callStatus = isDnc ? "BLOCKED_DNC" : "BLOCKED_NO_CONSENT";
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: leadStatus },
          });
          await prisma.callLog.create({
            data: { leadId: lead.id, duration: 0, status: callStatus },
          });
          await prisma.auditLog.create({
            data: {
              actorType: "SYSTEM",
              actorId: "campaign-worker",
              organizationId,
              targetOrganizationId: organizationId,
              action: isDnc ? "CALL_BLOCKED_DNC" : "CALL_BLOCKED_NO_CONSENT",
              entity: "Lead",
              entityId: lead.id,
              metadata: body as any,
            },
          });
          continue;
        }
        if (startResp.status === 429) {
          // Calling-service refused because the org just crossed its
          // VAPI_CALL quota. Pause the whole campaign rather than churn
          // through the remaining leads as FAILED.
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: "PAUSED_QUOTA" },
          });
          console.warn(
            `[campaignWorker] campaign ${campaignId} paused — calling-service returned 429`
          );
          return { status: "PAUSED_QUOTA", processed: index };
        }

        if (!startResp.ok) {
          throw new Error(
            `calling-service /internal/call returned ${startResp.status}`
          );
        }

        const { vapiCallId } = (await startResp.json()) as InitiateCallResponse;
        if (!vapiCallId) {
          throw new Error("calling-service did not return a vapiCallId");
        }

        // Defensive upsert. calling-service creates the CallLog itself, but
        // upserting keyed on the unique vapiCallId is idempotent and protects
        // us against transient races where a retry sees the row already.
        await prisma.callLog.upsert({
          where: { vapiCallId },
          create: {
            leadId: lead.id,
            duration: 0,
            status: "PENDING",
            vapiCallId,
          },
          update: {
            // Don't downgrade status if calling-service already wrote IN_PROGRESS.
            leadId: lead.id,
          },
        });

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: "CALLED",
            callAttempts: { increment: 1 },
          },
        });

        // Usage incrementing happens inside calling-service (vapi.initiateCall
        // → meterAndCharge VAPI_CALL). The campaign worker no longer
        // double-counts here.
      } catch (leadErr: any) {
        console.error(
          `Lead ${leadId} failed in campaign ${campaignId}:`,
          leadErr?.message ?? leadErr
        );
        await prisma.lead
          .update({ where: { id: leadId }, data: { status: "FAILED" } })
          .catch(() => {});
      }

      await job.updateProgress({
        completed: index + 1,
        total: leadIds.length,
      });

      await publishCampaignProgress(campaignId, {
        event: "lead-dispatched",
        campaignId,
        leadId,
        completed: index + 1,
        total: leadIds.length,
      });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED" },
    });

    return { status: "COMPLETED", processed: leadIds.length };
  } catch (err: any) {
    console.error("[campaignWorker] fatal error for campaign", campaignId, err);
    await prisma.campaign
      .update({ where: { id: campaignId }, data: { status: "FAILED" } })
      .catch(() => {});
    throw err;
  }
}
