import { Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { redisConnection, publishCampaignProgress } from "../lib/queue.js";
import { VapiService } from "../services/vapi.js";
import { assertWithinQuota, QuotaExceededError } from "../lib/quota.js";
import {
  resolveCredentials,
  CredentialsUnavailableError,
} from "../lib/credentials.js";
import {
  debitWithMarkup,
  InsufficientCreditsError,
} from "../lib/paygDebit.js";
import { scrubBrandStrings } from "../services/provisioning/brandScrub.js";
import { logger } from "../lib/logger.js";
import { ConsentRequiredError, DNCBlockedError } from "../lib/complianceErrors.js";
import { writeAudit } from "../lib/audit.js";
import {
  isWithinAllowedWindow,
  nextAllowedWindow,
  inferStateFromAreaCode,
} from "../lib/callWindow.js";
import { callQueue } from "../lib/queue.js";
import { emitTenantEvent } from "../lib/webhookEmit.js";

export interface CampaignCallJobData {
  campaignId: string;
  organizationId: string;
  leadIds: string[];
}

export async function campaignWorker(job: Job<CampaignCallJobData>) {
  const { campaignId, organizationId, leadIds } = job.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { organization: { include: { apiKeys: true } } },
  });

  if (!campaign || campaign.organizationId !== organizationId) {
    throw new Error(`Campaign ${campaignId} not found for org ${organizationId}`);
  }

  const org = campaign.organization;

  // Phase 5 Agent M5 — pick BYOK vs platform creds. PAYG/SUBSCRIPTION orgs
  // use Callora's master Vapi key + the per-org provisioned assistant + phone
  // number. BYOK keeps the legacy path with the tenant's own keys.
  let vapi: VapiService;
  let isPlatformCreds = false;
  let platformAssistantId: string | undefined;
  try {
    const creds = await resolveCredentials(organizationId, "VAPI");
    isPlatformCreds = creds.kind === "PLATFORM";
    platformAssistantId =
      creds.kind === "PLATFORM" ? creds.vapiAssistantId : undefined;
    vapi = new VapiService(creds.apiKey, creds.vapiPhoneNumberId ?? "");
  } catch (credErr: any) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    if (credErr instanceof CredentialsUnavailableError) {
      throw new Error(scrubBrandStrings(credErr.message));
    }
    throw credErr;
  }

  const orgAiConfig = {
    aiCallerName: org.aiCallerName,
    aiCallerCompany: org.aiCallerCompany,
    aiCallerPhone: org.aiCallerPhone,
    aiSystemPrompt: org.aiSystemPrompt,
  };

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

      // ----- TCPA call-window enforcement (Phase 2 Agent 9) -----
      // Resolve the lead's state: explicit Lead.state wins, otherwise infer
      // from the phone's area code, otherwise fall back to DEFAULT (the
      // conservative federal window in ET).
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
        await writeAudit({
          actorType: "SYSTEM",
          actorId: "campaign-worker",
          organizationId,
          targetOrganizationId: organizationId,
          action: "CALL_DEFERRED_WINDOW",
          entity: "Lead",
          entityId: lead.id,
          metadata: { state, nextCallAt: next.toISOString() },
        });
        continue;
      }

      try {
        // Phase 5 Agent M5 — PAYG pre-deduct. Reserve $1.50 worth of credits
        // for this call BEFORE we dial. The webhook reconciliation step
        // (callCompletedWorker) credits back the difference once the actual
        // cost lands. No-op for BYOK / SUBSCRIPTION orgs.
        try {
          await debitWithMarkup(
            organizationId,
            "DEBIT_CALL",
            150,
            `pending:${leadId}`,
            { provisional: true, leadId, campaignId }
          );
        } catch (debitErr: any) {
          if (debitErr instanceof InsufficientCreditsError) {
            // Soft-pause the org + campaign and stop the run. Recovery comes
            // through the topup webhook which flips status back to ACTIVE.
            await prisma.organization
              .update({
                where: { id: organizationId },
                data: { status: "PAUSED_NO_CREDIT" },
              })
              .catch(() => {});
            await prisma.campaign.update({
              where: { id: campaignId },
              data: { status: "PAUSED_QUOTA" },
            });
            logger.warn(
              { campaignId, leadId, required: debitErr.required, current: debitErr.current },
              "campaign paused — insufficient credits mid-run"
            );
            await writeAudit({
              actorType: "SYSTEM",
              actorId: "campaign-worker",
              organizationId,
              targetOrganizationId: organizationId,
              action: "CAMPAIGN_PAUSED_NO_CREDIT",
              entity: "Campaign",
              entityId: campaignId,
              metadata: {
                required: debitErr.required,
                current: debitErr.current,
              },
            });
            return { status: "PAUSED_NO_CREDIT", processed: index };
          }
          throw debitErr;
        }
        // Fire-and-forget: initiate the call, persist a PENDING CallLog with
        // the returned vapiCallId, and move on. The Vapi webhook updates the
        // CallLog and enqueues a callCompleted job that handles Gemini
        // qualification and qualified-lead email delivery.
        // makeCall calls meterAndCharge(VAPI_CALL, 1) internally before
        // hitting Vapi. If the org is over quota the call is never placed
        // and QuotaExceededError bubbles up to the outer try below.
        const callResult = isPlatformCreds && platformAssistantId
          ? await vapi.makeCallWithAssistant(
              lead.phone,
              lead.businessName,
              platformAssistantId,
              organizationId
            )
          : await vapi.makeCall(
              lead.phone,
              lead.businessName,
              orgAiConfig,
              organizationId
            );

        if (!callResult.vapiCallId) {
          throw new Error("Vapi did not return a call id");
        }

        await prisma.callLog.upsert({
          where: { vapiCallId: callResult.vapiCallId },
          create: {
            leadId: lead.id,
            duration: 0,
            status: "PENDING",
            vapiCallId: callResult.vapiCallId,
          },
          update: {
            // Same vapiCallId already exists (extremely rare); treat as no-op.
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
        // Note: usage incrementing happens inside vapi.initiateCall via
        // meterAndCharge — we no longer call recordUsage here.
      } catch (leadErr: any) {
        // Consent / DNC blocks → per-lead skip (NOT a campaign abort).
        if (leadErr instanceof ConsentRequiredError || leadErr?.name === "ConsentRequiredError") {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "SKIPPED_NO_CONSENT" },
          });
          await prisma.callLog.create({
            data: { leadId: lead.id, duration: 0, status: "BLOCKED_NO_CONSENT" },
          });
          await writeAudit({
            actorType: "SYSTEM",
            actorId: "campaign-worker",
            organizationId,
            targetOrganizationId: organizationId,
            action: "CALL_BLOCKED_NO_CONSENT",
            entity: "Lead",
            entityId: lead.id,
            metadata: { reason: leadErr.reason },
          });
          continue;
        }
        if (leadErr instanceof DNCBlockedError || leadErr?.name === "DNCBlockedError") {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "SKIPPED_DNC" },
          });
          await prisma.callLog.create({
            data: { leadId: lead.id, duration: 0, status: "BLOCKED_DNC" },
          });
          await writeAudit({
            actorType: "SYSTEM",
            actorId: "campaign-worker",
            organizationId,
            targetOrganizationId: organizationId,
            action: "CALL_BLOCKED_DNC",
            entity: "Lead",
            entityId: lead.id,
            metadata: { source: leadErr.source },
          });
          continue;
        }
        // QuotaExceededError on a per-lead dispatch means the org just
        // crossed its limit mid-campaign. Pause the whole campaign so the
        // remaining leads don't churn through "FAILED".
        if (leadErr?.name === "QuotaExceededError" || leadErr instanceof QuotaExceededError) {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: "PAUSED_QUOTA" },
          });
          logger.warn(
            { campaignId, leadId, kind: leadErr.kind, current: leadErr.current, limit: leadErr.limit },
            "campaign paused — quota exceeded mid-run"
          );
          return { status: "PAUSED_QUOTA", processed: index };
        }
        logger.error(
          { err: leadErr?.message ?? String(leadErr), leadId, campaignId },
          "lead initiation failed"
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

    // Phase 3 Agent 12 — fire CAMPAIGN_COMPLETED tenant webhook.
    await emitTenantEvent(organizationId, "CAMPAIGN_COMPLETED", {
      campaignId,
      campaignName: campaign.name,
      leadCount: leadIds.length,
    });

    return { status: "COMPLETED", processed: leadIds.length };
  } catch (err: any) {
    logger.error({ err, campaignId }, "campaign worker fatal error");
    await prisma.campaign
      .update({ where: { id: campaignId }, data: { status: "FAILED" } })
      .catch(() => {});
    throw err;
  }
}
