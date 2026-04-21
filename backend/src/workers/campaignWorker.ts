import { Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { VapiService } from "../services/vapi.js";
import { GeminiService } from "../services/gemini.js";
import { assertWithinQuota, recordUsage } from "../lib/quota.js";
import { sendEmail, APP_URL } from "../lib/email.js";
import { qualifiedLeadEmail } from "../emails/qualifiedLead.js";

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
  const keys = org.apiKeys;
  if (!keys || !keys.vapiKey || !keys.vapiPhoneId || !keys.geminiKey) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    throw new Error("Missing Vapi/Gemini API keys");
  }

  const orgAiConfig = {
    aiCallerName: org.aiCallerName,
    aiCallerCompany: org.aiCallerCompany,
    aiCallerPhone: org.aiCallerPhone,
    aiSystemPrompt: org.aiSystemPrompt,
  };

  const vapi = new VapiService(keys.vapiKey, keys.vapiPhoneId);
  const gemini = new GeminiService(keys.geminiKey);

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
        const callResult = await vapi.makeCall(
          lead.phone,
          lead.businessName,
          orgAiConfig
        );

        let analysis: any = {
          interestScore: 0,
          isQualified: false,
          sentiment: "NEUTRAL",
          summary: "Call Failed",
        };

        if (callResult.status === "COMPLETED" && callResult.transcript) {
          analysis = await gemini.qualifyLead(
            callResult.transcript,
            lead.businessName
          );
        }

        await prisma.callLog.create({
          data: {
            leadId: lead.id,
            duration: callResult.durationSeconds,
            status: callResult.status,
            transcript: callResult.transcript,
            summary: analysis.summary,
            vapiCallId: callResult.vapiCallId ?? null,
            cost: callResult.cost ?? null,
            costBreakdown: (callResult.costBreakdown as any) ?? undefined,
          },
        });

        const newStatus =
          callResult.status === "COMPLETED"
            ? analysis.isQualified
              ? "QUALIFIED"
              : "CALLED"
            : callResult.status === "NO_ANSWER" || callResult.status === "VOICEMAIL"
            ? "PENDING_RETRY"
            : "CALLED";

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: newStatus,
            interestScore: analysis.interestScore ?? 0,
            callAttempts: { increment: 1 },
          },
        });

        await recordUsage(organizationId, "call", 1);

        if (analysis.isQualified && (analysis.interestScore ?? 0) >= 60) {
          const adminUser = await prisma.user.findFirst({
            where: { organizationId, role: "ADMIN" },
          });
          if (adminUser?.email) {
            const leadUrl = `${APP_URL}/leads/${lead.id}`;
            const { subject, html } = qualifiedLeadEmail(
              adminUser.name ?? "",
              {
                businessName: lead.businessName,
                phone: lead.phone ?? "",
                interestScore: analysis.interestScore ?? 0,
              },
              campaign.name,
              leadUrl
            );
            await sendEmail(adminUser.email, subject, html);
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
    console.error(`Campaign ${campaignId} worker failed:`, err);
    await prisma.campaign
      .update({ where: { id: campaignId }, data: { status: "FAILED" } })
      .catch(() => {});
    throw err;
  }
}
