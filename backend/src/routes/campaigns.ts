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
  const { name, prompt } = req.body;

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name,
        prompt,
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

// POST /campaigns/:id/run
router.post("/:id/run", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: { organization: { include: { apiKeys: true } } },
    });

    if (!campaign || !campaign.organization.apiKeys) {
      return res.status(404).json({ error: "Campaign/Keys not found" });
    }

    const keys = campaign.organization.apiKeys;
    if (
      !keys.googleMapsKey ||
      !keys.geminiKey ||
      !keys.vapiKey ||
      !keys.vapiPhoneId
    ) {
      return res.status(400).json({ error: "Missing API Keys" });
    }

    // Acknowledge receipt immediately (Async processing? No, keeping synchronous for MVP simplicity but separating concerns)
    // Actually, user expects a response. Long polling used before.
    // Express default timeout is long. We'll run it and return when done.

    const gemini = new GeminiService(keys.geminiKey);
    const places = new PlacesService(keys.googleMapsKey);
    const vapi = new VapiService(keys.vapiKey, keys.vapiPhoneId);

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "RUNNING" },
    });

    const queries = await gemini.generateSearchQueries(campaign.prompt);

    let leadsData: any[] = [];
    for (const q of queries) {
      const results = await places.findLeads(q);
      leadsData = [...leadsData, ...results];
    }

    const uniqueLeads = Array.from(
      new Map(leadsData.map((item: any) => [item.id, item])).values()
    );

    for (const leadData of uniqueLeads) {
      if (!leadData.phone) continue;

      const lead = await prisma.lead.create({
        data: {
          businessName: leadData.name || "Unknown",
          address: leadData.address,
          phone: leadData.phone,
          campaignId: campaign.id,
          organizationId,
        },
      });

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
    console.error("Campaign Run Error:", error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    res.status(500).json({ error: error.message });
  }
});

export default router;
