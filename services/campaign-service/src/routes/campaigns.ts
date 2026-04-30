import express, { Request, Response } from "express";
import { prisma, assertWithinQuota, recordUsage, QuotaError } from "@callora/shared";
import { authenticate, AuthRequest } from "../middleware/requireAuth.js";
import { callQueue, redisConnection } from "../lib/queue.js";

const router = express.Router();

const LEAD_SERVICE_URL = process.env.LEAD_SERVICE_URL!;
const CALLING_SERVICE_URL = process.env.CALLING_SERVICE_URL!;
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL!;

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

    const count = await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
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

// POST /campaigns/:id/scrape — delegated to lead-service in microservices mode
router.post("/:id/scrape", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const { keyword, location, maxResults } = req.body as {
    keyword?: string;
    location?: string;
    maxResults?: number;
  };

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { id: true },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    if (!keyword || !location) {
      return res
        .status(400)
        .json({ error: "keyword and location are required" });
    }

    let upstream;
    try {
      upstream = await fetch(`${LEAD_SERVICE_URL}/internal/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          keyword,
          location,
          maxResults,
          campaignId,
        }),
      });
    } catch (netErr: any) {
      console.error("[campaign-service] scrape network error:", netErr);
      return res
        .status(500)
        .json({ error: `lead-service unreachable: ${netErr.message}` });
    }

    const body: any = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json(body);
    }
    return res.json(body);
  } catch (error: any) {
    console.error("[campaign-service] scrape error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/call — enqueue background campaign execution
//
// Mirrors the monolith pre-check (Phase 1 wrap-up Task 2): refuse with 429
// if the projected dispatch would exceed the org's VAPI_CALL quota, unless
// `?force=true` opts into a partial run.
async function enqueueCampaignCalls(req: Request, res: Response) {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const force = req.query.force === "true" || req.query.force === "1";

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status === "RUNNING" || campaign.status === "CALLING") {
      return res.status(400).json({ error: "Campaign already running" });
    }

    const blacklisted = await prisma.blacklist.findMany({
      where: { organizationId },
      select: { phoneNumber: true },
    });
    const blacklistedSet = new Set(blacklisted.map((b: { phoneNumber: string }) => b.phoneNumber));

    const allLeads = await prisma.lead.findMany({
      where: {
        campaignId,
        organizationId,
        status: { in: ["NEW", "PENDING_RETRY"] },
      },
      select: { id: true, phone: true },
    });
    const leads = allLeads.filter(
      (l: { id: string; phone: string | null }) => l.phone && !blacklistedSet.has(l.phone)
    );

    if (leads.length === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "COMPLETED" },
      });
      return res.json({ success: true, message: "No new leads to call", totalLeads: 0 });
    }

    if (!force) {
      const sub = await prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: true },
      });
      const limit =
        (sub?.plan?.maxCallsPerMonth ?? sub?.plan?.monthlyCallQuota ?? null) as
          | number
          | null;
      if (limit !== null) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const usage = await prisma.usageRecord.findUnique({
          where: {
            organizationId_periodStart: { organizationId, periodStart: start },
          },
        });
        const current = usage?.callsMade ?? 0;
        if (current + leads.length > limit) {
          return res.status(429).json({
            error: "QUOTA_WOULD_BE_EXCEEDED",
            kind: "VAPI_CALL",
            current,
            limit,
            requested: leads.length,
            message:
              "Starting this campaign would exceed your monthly call quota. Re-run with ?force=true to dispatch a partial run, or upgrade your plan.",
          });
        }
      }
    }

    await redisConnection.srem("cancelled_campaigns", campaignId);

    const job = await callQueue.add("processCampaignCalls", {
      campaignId,
      organizationId,
      leadIds: leads.map((l: { id: string }) => l.id),
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

// GET /campaigns/:id/followups/pending
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

// POST /campaigns/:id/followups — process due retries / follow-ups via downstream services
router.post("/:id/followups", async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const now = new Date();

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: { organization: true },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
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

    let processed = 0;

    for (const lead of allLeads) {
      // Start the call via calling-service. Vapi credentials are platform-
      // owned and read from env on calling-service — never forwarded.
      const startResp = await fetch(`${CALLING_SERVICE_URL}/internal/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          organizationId,
          aiCallerName: campaign.organization.aiCallerName,
          aiCallerCompany: campaign.organization.aiCallerCompany,
          aiCallerPhone: campaign.organization.aiCallerPhone,
          aiSystemPrompt: campaign.organization.aiSystemPrompt ?? undefined,
        }),
      });

      if (!startResp.ok) {
        console.error(`Follow-up call start failed for lead ${lead.id}: ${startResp.status}`);
        continue;
      }
      const { vapiCallId } = (await startResp.json()) as { callLogId: string; vapiCallId: string };

      // Poll for result
      let result: any = null;
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollResp = await fetch(
          `${CALLING_SERVICE_URL}/internal/call-result/${vapiCallId}?organizationId=${organizationId}`
        );
        if (!pollResp.ok) continue;
        const data: any = await pollResp.json();
        if (data.status !== "IN_PROGRESS") {
          result = data;
          break;
        }
      }

      if (!result) {
        result = { status: "FAILED", duration: 0 };
      }

      let analysis: any = {
        interestScore: lead.interestScore,
        isQualified: false,
        summary: result.summary ?? "No answer",
      };

      if (result.status === "COMPLETED" && result.transcript) {
        const qualifyResp = await fetch(`${LEAD_SERVICE_URL}/internal/qualify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            organizationId,
          }),
        });
        if (qualifyResp.ok) {
          analysis = await qualifyResp.json();
        }
      }

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: analysis.isQualified ? "QUALIFIED" : "DISQUALIFIED",
          interestScore: analysis.interestScore ?? lead.interestScore,
          notes: analysis.summary,
        },
      });
    }
  } catch (err: any) {
    console.error("[campaign-service] worker error:", err);
  }
});

export default router;
