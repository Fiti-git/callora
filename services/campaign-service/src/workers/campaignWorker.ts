import { Job } from "bullmq";
import { prisma, assertWithinQuota, recordUsage } from "@callora/shared";
import { redisConnection } from "../lib/queue.js";

const LEAD_SERVICE_URL = process.env.LEAD_SERVICE_URL!;
const CALLING_SERVICE_URL = process.env.CALLING_SERVICE_URL!;
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL!;
const APP_URL = process.env.TENANT_APP_ORIGIN ?? "http://localhost:3000";

// Platform-owned infrastructure keys. Tenants no longer supply Vapi/Gemini/
// Google Maps credentials — Callora is fully managed.
const VAPI_KEY = process.env.VAPI_PRIVATE_KEY!;
const VAPI_PHONE_ID = process.env.VAPI_PHONE_NUMBER_ID!;

export interface CampaignCallJobData {
  campaignId: string;
  organizationId: string;
  leadIds: string[];
}

interface CallResultPayload {
  status: "IN_PROGRESS" | "COMPLETED" | "NO_ANSWER" | "VOICEMAIL" | "FAILED" | string;
  duration: number;
  transcript?: string;
  summary?: string;
  cost?: number;
}

async function pollCallResult(
  vapiCallId: string,
  organizationId: string
): Promise<CallResultPayload> {
  const deadline = Date.now() + 5 * 60 * 1000; // 5-minute cap (matches monolith Vapi.makeCall behaviour)
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const resp = await fetch(
        `${CALLING_SERVICE_URL}/internal/call-result/${vapiCallId}?organizationId=${organizationId}`
      );
      if (!resp.ok) continue;
      const data = (await resp.json()) as CallResultPayload;
      if (data.status !== "IN_PROGRESS") {
        return data;
      }
    } catch (err) {
      console.warn(`[campaignWorker] poll error for ${vapiCallId}:`, err);
    }
  }
  return { status: "FAILED", duration: 0 };
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
        `[campaignWorker] qualifiedLead email failed: HTTP ${resp.status}`
      );
    }
  } catch (err) {
    console.error(`[campaignWorker] qualifiedLead email error:`, err);
  }
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

      try {
        // 1) Start the call via calling-service. Vapi credentials live on
        // calling-service via env — we no longer forward them per-call.
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

        if (!startResp.ok) {
          throw new Error(
            `calling-service /internal/call returned ${startResp.status}`
          );
        }
        const { vapiCallId } = (await startResp.json()) as {
          callLogId: string;
          vapiCallId: string;
        };

        // 2) Poll for result until status !== IN_PROGRESS
        const callResult = await pollCallResult(vapiCallId, organizationId);

        // 3) Qualify if we have a transcript
        let analysis: {
          interestScore: number;
          isQualified: boolean;
          summary: string;
        } = {
          interestScore: 0,
          isQualified: false,
          summary: callResult.summary ?? "Call Failed",
        };

        if (callResult.status === "COMPLETED" && callResult.transcript) {
          const qResp = await fetch(`${LEAD_SERVICE_URL}/internal/qualify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadId: lead.id,
              organizationId,
              transcript: callResult.transcript,
            }),
          });
          if (qResp.ok) {
            const q = (await qResp.json()) as {
              interestScore: number;
              summary: string;
              status: "QUALIFIED" | "CALLED";
            };
            analysis = {
              interestScore: q.interestScore,
              isQualified: q.status === "QUALIFIED",
              summary: q.summary,
            };
          } else {
            console.error(
              `[campaignWorker] /internal/qualify returned ${qResp.status} for lead ${lead.id}`
            );
          }
        }

        // calling-service has already created the CallLog (status IN_PROGRESS).
        // We don't recreate it here — the calling-service is responsible for
        // updating the CallLog with final status/transcript/summary/cost.

        // Decide lead status. lead-service /internal/qualify already updates the
        // Lead row when QUALIFIED/CALLED, but for non-COMPLETED outcomes (NO_ANSWER,
        // VOICEMAIL, FAILED) we need to set retry/called state ourselves.
        if (callResult.status !== "COMPLETED") {
          const newStatus =
            callResult.status === "NO_ANSWER" || callResult.status === "VOICEMAIL"
              ? "PENDING_RETRY"
              : "CALLED";
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              status: newStatus,
              callAttempts: { increment: 1 },
            },
          });
        } else {
          // Bump attempt counter; lead-service already wrote status/score/notes.
          await prisma.lead.update({
            where: { id: lead.id },
            data: { callAttempts: { increment: 1 } },
          });
        }

        await recordUsage(organizationId, "call", 1);

        if (analysis.isQualified && analysis.interestScore >= 60) {
          const adminUser = await prisma.user.findFirst({
            where: { organizationId, role: "ADMIN" },
          });
          if (adminUser?.email) {
            const leadUrl = `${APP_URL}/leads/${lead.id}`;
            await sendQualifiedLeadEmail({
              to: adminUser.email,
              adminName: adminUser.name ?? "",
              lead: {
                businessName: lead.businessName,
                phone: lead.phone ?? "",
                interestScore: analysis.interestScore,
              },
              campaignName: campaign.name,
              leadUrl,
            });
          }
        }
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
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED" },
    });

    return { status: "COMPLETED", processed: leadIds.length };
  } catch (err: any) {
    console.error('[campaignWorker] fatal error for campaign', campaignId, err);
    await prisma.campaign
      .update({ where: { id: campaignId }, data: { status: "FAILED" } })
      .catch(() => {});
    throw err;
  }
}
