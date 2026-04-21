import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { GeminiService } from "../services/gemini.js";
import { PlacesService } from "../services/places.js";
import { VapiService } from "../services/vapi.js";
import { assertWithinQuota, recordUsage, QuotaError } from "../lib/quota.js";
import { callQueue, redisConnection } from "../lib/queue.js";

const router = express.Router();

// --- Follow-up automation helpers ---

function normalizePhone(raw: string): string {
  if (!raw) return "";
  let digits = raw.toString().replace(/[^\d+]/g, "");
  if (digits.startsWith("+1")) digits = digits.slice(2);
  else if (digits.startsWith("1") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function computeNextLeadState(
  callStatus: string,
  isQualified: boolean,
  attemptNumber: number,
  campaign: { maxRetryAttempts: number; retryDelayHours: number; followUpDelayDays: number }
): { status: string; nextCallAt: Date | null; followUpAt: Date | null } {
  const now = new Date();

  if (callStatus === "COMPLETED") {
    if (isQualified) {
      return {
        status: "PENDING_FOLLOWUP",
        nextCallAt: null,
        followUpAt: addDays(now, campaign.followUpDelayDays),
      };
    }
    return { status: "CALLED", nextCallAt: null, followUpAt: null };
  }

  if (
    (callStatus === "NO_ANSWER" || callStatus === "VOICEMAIL") &&
    attemptNumber < campaign.maxRetryAttempts
  ) {
    return {
      status: "PENDING_RETRY",
      nextCallAt: addHours(now, campaign.retryDelayHours),
      followUpAt: null,
    };
  }

  return { status: "CALLED", nextCallAt: null, followUpAt: null };
}

router.use(authenticate);

// GET /campaigns
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true } } },
    });
    res.json(campaigns);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns
router.post("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { name, prompt, type } = req.body;

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name,
        type: type || "AI",
        prompt: prompt || null,
        organizationId,
        status: "DRAFT",
      },
    });
    console.log("Created Campaign:", campaign);
    res.status(201).json(campaign);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /campaigns/:id/followup-settings
router.patch("/:id/followup-settings", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { maxRetryAttempts, retryDelayHours, followUpDelayDays } = req.body;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        ...(maxRetryAttempts !== undefined && { maxRetryAttempts: Number(maxRetryAttempts) }),
        ...(retryDelayHours !== undefined && { retryDelayHours: Number(retryDelayHours) }),
        ...(followUpDelayDays !== undefined && { followUpDelayDays: Number(followUpDelayDays) }),
      },
      select: {
        id: true,
        name: true,
        maxRetryAttempts: true,
        retryDelayHours: true,
        followUpDelayDays: true,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /campaigns/:id
router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id, organizationId },
      include: {
        leads: {
          orderBy: { interestScore: "desc" },
          include: { calls: true },
        },
      },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.json(campaign);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/import  — manual CSV upload
router.post("/:id/import", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const { leads } = req.body as {
    leads: {
      phone?: string;
      name?: string;
      // legacy fields for backward compatibility
      number?: string;
      company?: string;
      designation?: string;
      discussionArea?: string;
    }[];
  };

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "No leads provided" });
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const count = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      for (const row of leads) {
        const rawPhone = row.phone ?? row.number ?? "";
        const phone = normalizePhone(rawPhone);
        if (!phone || phone.length < 7) continue;

        const businessName = (row.name || row.company || "").trim() || "Unknown";

        const existing = await tx.lead.findFirst({
          where: { campaignId, phone },
        });
        if (existing) continue;

        const notes = [
          row.designation ? `Designation: ${row.designation}` : null,
          row.discussionArea ? `Discussion: ${row.discussionArea}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        await tx.lead.create({
          data: {
            businessName,
            phone,
            notes: notes || null,
            campaignId,
            organizationId,
            status: "NEW",
          },
        });
        inserted++;
      }

      await tx.campaign.update({
        where: { id: campaignId },
        data: { status: "READY" },
      });

      return inserted;
    });

    res.json({ success: true, count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/scrape
router.post("/:id/scrape", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: { organization: { include: { apiKeys: true } } },
    });

    if (!campaign || !campaign.organization.apiKeys) {
      return res
        .status(404)
        .json({ error: "Campaign not found or missing keys" });
    }

    const keys = campaign.organization.apiKeys;
    if (!keys.googleMapsKey || !keys.geminiKey) {
      return res.status(400).json({ error: "Missing Google/Gemini API Keys" });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "SCRAPING" },
    });

    const gemini = new GeminiService(keys.geminiKey);
    const places = new PlacesService(keys.googleMapsKey);

    const queries = await gemini.generateSearchQueries(campaign.prompt ?? "");

    let leadsData: any[] = [];
    for (const q of queries) {
      const results = await places.findLeads(q);
      leadsData = [...leadsData, ...results];
    }

    const uniqueLeads = Array.from(
      new Map(leadsData.map((item: any) => [item.id, item])).values()
    );

    // AI POST-FILTERING
    // We send the leads to Gemini to filter based on the user's prompt logic (e.g. "less than 50 reviews")
    const filteredIds = await gemini.filterLeads(uniqueLeads, campaign.prompt ?? "");

    // Filter the leads data by the matching IDs
    const finalLeads = uniqueLeads.filter((l) => filteredIds.includes(l.id));

    const limit = req.body.limit || 20;
    const leadsToInsert = finalLeads
      .filter((l: any) => l.phone)
      .slice(0, limit);

    // Quota check — ensure org has capacity for the leads we're about to insert
    await assertWithinQuota(organizationId, "lead", leadsToInsert.length);

    let count = 0;
    for (const leadData of leadsToInsert) {
      // Check if lead already exists for this campaign to avoid duplicates on re-scrape
      const existing = await prisma.lead.findFirst({
        where: { campaignId, phone: leadData.phone },
      });

      if (!existing) {
        await prisma.lead.create({
          data: {
            businessName: leadData.name || "Unknown",
            address: leadData.address,
            phone: leadData.phone,
            campaignId: campaign.id,
            organizationId,
            status: "NEW", // Explicitly NEW
          },
        });
        count++;
      }
    }

    if (count > 0) {
      await recordUsage(organizationId, "lead", count);
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "READY" }, // Ready for calling
    });

    res.json({ success: true, count });
  } catch (error: any) {
    if (error instanceof QuotaError) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "DRAFT" },
      }).catch(() => {});
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Scrape Error:", error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/call — enqueue background campaign execution
async function enqueueCampaignCalls(req: Request, res: Response) {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: { organization: { include: { apiKeys: true } } },
    });

    if (!campaign || !campaign.organization.apiKeys) {
      return res
        .status(404)
        .json({ error: "Campaign not found or missing keys" });
    }

    const keys = campaign.organization.apiKeys;
    if (!keys.vapiKey || !keys.vapiPhoneId || !keys.geminiKey) {
      return res.status(400).json({ error: "Missing Vapi/Gemini Keys" });
    }

    if (campaign.status === "RUNNING" || campaign.status === "CALLING") {
      return res.status(400).json({ error: "Campaign already running" });
    }

    const leads = await prisma.lead.findMany({
      where: { campaignId, status: { in: ["NEW", "PENDING_RETRY"] } },
      select: { id: true },
    });

    if (leads.length === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "COMPLETED" },
      });
      return res.json({ success: true, message: "No new leads to call", totalLeads: 0 });
    }

    // Clear any stale cancel flag from a previous run
    await redisConnection.srem("cancelled_campaigns", campaignId);

    const job = await callQueue.add("processCampaignCalls", {
      campaignId,
      organizationId,
      leadIds: leads.map((l) => l.id),
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { jobId: job.id ?? null, status: "RUNNING" },
    });

    res.json({ success: true, jobId: job.id, totalLeads: leads.length });
  } catch (error: any) {
    console.error("Call Enqueue Error:", error);
    res.status(500).json({ error: error.message });
  }
}

router.post("/:id/call", enqueueCampaignCalls);
router.post("/:id/call-leads", enqueueCampaignCalls);

// GET /campaigns/:id/progress
router.get("/:id/progress", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      select: { id: true, status: true, jobId: true },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    let progress: { completed: number; total: number } = { completed: 0, total: 0 };
    if (campaign.jobId) {
      const job = await callQueue.getJob(campaign.jobId);
      if (job) {
        const p = job.progress;
        if (p && typeof p === "object" && "total" in p) {
          progress = p as { completed: number; total: number };
        }
      }
    }

    res.json({
      status: campaign.status,
      jobId: campaign.jobId,
      progress,
      campaignStatus: campaign.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/cancel
router.post("/:id/cancel", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      select: { id: true },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    await redisConnection.sadd("cancelled_campaigns", campaignId);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "CANCELLED" },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /campaigns/:id/followups/pending — count leads due for retry/follow-up
router.get("/:id/followups/pending", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const now = new Date();

  try {
    const [retryCount, followUpCount] = await Promise.all([
      prisma.lead.count({
        where: { campaignId, organizationId, status: "PENDING_RETRY", nextCallAt: { lte: now } },
      }),
      prisma.lead.count({
        where: { campaignId, organizationId, status: "PENDING_FOLLOWUP", followUpAt: { lte: now } },
      }),
    ]);

    res.json({ retryCount, followUpCount, total: retryCount + followUpCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/followups — process due retries and follow-up calls
router.post("/:id/followups", async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const now = new Date();

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: { organization: { include: { apiKeys: true } } },
    });

    if (!campaign || !campaign.organization.apiKeys) {
      return res.status(404).json({ error: "Campaign not found or missing keys" });
    }

    const keys = campaign.organization.apiKeys;
    if (!keys.vapiKey || !keys.vapiPhoneId || !keys.geminiKey) {
      return res.status(400).json({ error: "Missing Vapi/Gemini Keys" });
    }

    const retryLeads = await prisma.lead.findMany({
      where: { campaignId, status: "PENDING_RETRY", nextCallAt: { lte: now } },
    });

    const followUpLeads = await prisma.lead.findMany({
      where: { campaignId, status: "PENDING_FOLLOWUP", followUpAt: { lte: now } },
    });

    const allLeads = [...retryLeads, ...followUpLeads];

    if (allLeads.length === 0) {
      return res.json({ success: true, processed: 0, message: "No follow-ups due" });
    }

    const vapi = new VapiService(keys.vapiKey, keys.vapiPhoneId);
    const gemini = new GeminiService(keys.geminiKey);
    const orgAiConfig = {
      aiCallerName: campaign.organization.aiCallerName,
      aiCallerCompany: campaign.organization.aiCallerCompany,
      aiCallerPhone: campaign.organization.aiCallerPhone,
      aiSystemPrompt: campaign.organization.aiSystemPrompt,
    };

    let processed = 0;

    for (const lead of allLeads) {
      const callResult = await vapi.makeCall(lead.phone!, lead.businessName, orgAiConfig);

      let analysis: any = {
        interestScore: lead.interestScore,
        isQualified: false,
        sentiment: "NEUTRAL",
        summary: "No answer",
      };

      if (callResult.status === "COMPLETED" && callResult.transcript) {
        analysis = await gemini.qualifyLead(callResult.transcript, lead.businessName);
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

      // Auto-create a CALL note for the activity timeline
      if (analysis.summary && lead.contactId) {
        await prisma.note.create({
          data: {
            type: "CALL",
            content: analysis.summary,
            authorId: userId,
            leadId: lead.id,
            contactId: lead.contactId,
            organizationId,
          },
        });
      }

      const attemptNumber = lead.callAttempts + 1;
      const nextState = computeNextLeadState(
        callResult.status,
        analysis.isQualified,
        attemptNumber,
        campaign
      );

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          ...nextState,
          interestScore: analysis.interestScore,
          callAttempts: attemptNumber,
        },
      });

      processed++;
    }

    res.json({ success: true, processed });
  } catch (error: any) {
    console.error("Follow-up Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
