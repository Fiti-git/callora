import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { GeminiService } from "../services/gemini.js";
import { PlacesService } from "../services/places.js";
import { VapiService } from "../services/vapi.js";

const router = express.Router();

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
    leads: { name: string; number: string; company?: string; designation?: string; discussionArea?: string }[];
  };

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "No leads provided" });
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    let count = 0;
    for (const row of leads) {
      if (!row.number) continue;

      const existing = await prisma.lead.findFirst({
        where: { campaignId, phone: row.number },
      });
      if (existing) continue;

      const notes = [
        row.designation ? `Designation: ${row.designation}` : null,
        row.discussionArea ? `Discussion: ${row.discussionArea}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      await prisma.lead.create({
        data: {
          businessName: row.company || row.name || "Unknown",
          phone: row.number,
          notes: notes || null,
          campaignId,
          organizationId,
          status: "NEW",
        },
      });
      count++;
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "READY" },
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

    const queries = await gemini.generateSearchQueries(campaign.prompt);

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
    const filteredIds = await gemini.filterLeads(uniqueLeads, campaign.prompt);

    // Filter the leads data by the matching IDs
    const finalLeads = uniqueLeads.filter((l) => filteredIds.includes(l.id));

    const limit = req.body.limit || 20;

    let count = 0;
    for (const leadData of finalLeads) {
      if (count >= limit) break; // Respect the user-defined limit for NEW leads

      if (!leadData.phone) continue;

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

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "READY" }, // Ready for calling
    });

    res.json({ success: true, count });
  } catch (error: any) {
    console.error("Scrape Error:", error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/call
router.post("/:id/call", async (req: Request, res: Response) => {
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

    // Only start if ready or scraping (allow retry)
    if (campaign.status === "RUNNING" || campaign.status === "CALLING") {
      return res.status(400).json({ error: "Campaign already running" });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "CALLING" },
    });

    // Find leads that are NEW (scraped but not called)
    const leads = await prisma.lead.findMany({
      where: { campaignId, status: "NEW" },
    });

    if (leads.length === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "COMPLETED" },
      });
      return res.json({ success: true, message: "No new leads to call" });
    }

    const vapi = new VapiService(keys.vapiKey, keys.vapiPhoneId);
    const gemini = new GeminiService(keys.geminiKey);

    // simple loop (async for now, in production use background job)
    for (const lead of leads) {
      const callResult = await vapi.makeCall(lead.phone!, lead.businessName);

      let analysis: any = {
        interestScore: 0,
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
        },
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: analysis.isQualified ? "QUALIFIED" : "CALLED",
          interestScore: analysis.interestScore,
        },
      });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED" },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Call Error:", error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    res.status(500).json({ error: error.message });
  }
});

export default router;
