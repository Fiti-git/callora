import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { GeminiService } from "../services/gemini.js";
import { VapiService } from "../services/vapi.js";
import { assertWithinQuota, recordUsage, QuotaError } from "../lib/quota.js";

const router = express.Router();
router.use(authenticate);

const demoCallSchema = z.object({
  phone: z.string().min(7),
  name: z.string().min(1),
  description: z.string().optional(),
  firstMessage: z.string().optional(),
});

// GET /demo/history — last 10 demo calls for this org
router.get("/history", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const demoCampaign = await prisma.campaign.findFirst({
      where: { organizationId, name: "__DEMO__" },
    });
    if (!demoCampaign) return res.json([]);

    const logs = await prisma.callLog.findMany({
      where: { lead: { campaignId: demoCampaign.id } },
      include: { lead: { select: { businessName: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /demo/call
router.post("/call", async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;

  const parsed = demoCallSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { phone, name, description, firstMessage } = parsed.data;

  try {
    await assertWithinQuota(organizationId, "call");

    // Load org API keys
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { apiKeys: true },
    });

    if (!org?.apiKeys?.vapiKey || !org.apiKeys.vapiPhoneId) {
      return res.status(400).json({ error: "Vapi API keys not configured. Go to Settings to add them." });
    }
    if (!org.apiKeys.geminiKey) {
      return res.status(400).json({ error: "Gemini API key not configured. Go to Settings to add it." });
    }

    // Auto-create a DEMO campaign per org (idempotent)
    let demoCampaign = await prisma.campaign.findFirst({
      where: { organizationId, name: "__DEMO__" },
    });
    if (!demoCampaign) {
      demoCampaign = await prisma.campaign.create({
        data: {
          name: "__DEMO__",
          type: "AI",
          status: "RUNNING",
          organizationId,
        },
      });
    }

    // Create a temporary lead for the demo call
    const lead = await prisma.lead.create({
      data: {
        businessName: name,
        phone,
        address: description ?? null,
        campaignId: demoCampaign.id,
        organizationId,
        status: "NEW",
      },
    });

    const vapi = new VapiService(org.apiKeys.vapiKey, org.apiKeys.vapiPhoneId);
    const gemini = new GeminiService(org.apiKeys.geminiKey);

    const orgAiConfig = {
      aiCallerName: org.aiCallerName,
      aiCallerCompany: org.aiCallerCompany,
      aiCallerPhone: org.aiCallerPhone,
      aiSystemPrompt: org.aiSystemPrompt,
    };

    // Override firstMessage on VapiService if provided
    const callResult = await (firstMessage
      ? vapi.makeCallWithMessage(phone, name, firstMessage)
      : vapi.makeCall(phone, name, orgAiConfig));

    let analysis: any = {
      interestScore: 0,
      isQualified: false,
      sentiment: "NEUTRAL",
      summary: "Call did not complete.",
      nextSteps: "Try calling again.",
    };

    if (callResult.status === "COMPLETED" && callResult.transcript) {
      analysis = await gemini.qualifyLead(callResult.transcript, name);
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

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "CALLED", interestScore: analysis.interestScore },
    });

    await recordUsage(organizationId, "call", 1);

    res.json({
      status: callResult.status,
      durationSeconds: callResult.durationSeconds,
      transcript: callResult.transcript,
      cost: callResult.cost,
      analysis: {
        sentiment: analysis.sentiment,
        interestScore: analysis.interestScore,
        summary: analysis.summary,
        nextSteps: analysis.nextSteps,
        isQualified: analysis.isQualified,
      },
    });
  } catch (error: any) {
    if (error instanceof QuotaError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Demo call error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
