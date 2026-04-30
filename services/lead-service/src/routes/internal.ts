import express, { Request, Response } from "express";
import {
  prisma,
  assertWithinQuota,
  recordUsage,
  QuotaError,
  QuotaExceededError,
} from "@callora/shared";
import { GeminiService } from "../services/gemini.js";
import { PlacesService } from "../services/places.js";

const router = express.Router();

// Platform-owned API keys. Tenants no longer supply Gemini / Google Maps
// credentials — Callora is fully managed.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;

/**
 * POST /internal/qualify
 *
 * Body: { leadId: string, organizationId: string, transcript?: string }
 *
 * Loads the Lead (scoped to organizationId), runs Gemini qualification with
 * the platform Gemini key, updates the Lead row, and returns
 * { interestScore, summary, status }.
 */
router.post("/qualify", async (req: Request, res: Response) => {
  const { leadId, organizationId, transcript: providedTranscript } = req.body as {
    leadId?: string;
    organizationId?: string;
    transcript?: string;
  };

  if (!leadId || !organizationId) {
    return res
      .status(400)
      .json({ error: "leadId and organizationId are required" });
  }

  try {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: {
        calls: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const transcript =
      providedTranscript ||
      lead.calls[0]?.transcript ||
      "";

    if (!transcript) {
      return res.status(400).json({ error: "No transcript available to qualify" });
    }

    const gemini = new GeminiService(GEMINI_API_KEY);
    const analysis = await gemini.qualifyLead(
      transcript,
      lead.businessName,
      organizationId
    );

    const newStatus = analysis.isQualified ? "QUALIFIED" : "CALLED";

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        interestScore: analysis.interestScore,
        notes: analysis.summary,
        status: newStatus,
      },
    });

    return res.json({
      interestScore: analysis.interestScore,
      summary: analysis.summary,
      status: newStatus,
    });
  } catch (error: any) {
    if (error instanceof QuotaExceededError || error?.name === "QuotaExceededError") {
      return res.status(429).json({
        error: "quota_exceeded",
        message: error.message,
        kind: error.kind,
        current: error.current,
        limit: error.limit,
        units: error.units,
      });
    }
    console.error("[lead-service] /internal/qualify error:", error);
    res.status(500).json({ error: "Qualification failed" });
  }
});

/**
 * POST /internal/scrape
 *
 * Body: { organizationId, keyword, location, maxResults?, campaignId? }
 *
 * Uses the platform Google Maps + Gemini keys to discover and filter leads,
 * persists them to DB under organizationId, and returns
 * { created: number, skipped: number, leadIds: string[] }.
 */
router.post("/scrape", async (req: Request, res: Response) => {
  const { organizationId, keyword, location, maxResults, campaignId } = req.body as {
    organizationId?: string;
    keyword?: string;
    location?: string;
    maxResults?: number;
    campaignId?: string;
  };

  if (!organizationId || !keyword || !location) {
    return res
      .status(400)
      .json({ error: "organizationId, keyword, and location are required" });
  }

  try {
    await assertWithinQuota(organizationId, "lead");

    const places = new PlacesService(GOOGLE_MAPS_API_KEY);
    const query = `${keyword} in ${location}`;
    const results = await places.findLeads(query, organizationId);
    const limited = results.slice(0, maxResults ?? 20);

    const created: string[] = [];
    let skipped = 0;

    for (const place of limited) {
      if (!place.phone) { skipped++; continue; }

      // Skip blacklisted numbers
      const blacklisted = await prisma.blacklist.findFirst({
        where: { organizationId, phoneNumber: place.phone },
      });
      if (blacklisted) { skipped++; continue; }

      // Skip duplicates within the org
      const existing = await prisma.lead.findFirst({
        where: { organizationId, phone: place.phone },
      });
      if (existing) { skipped++; continue; }

      const lead = await prisma.lead.create({
        data: {
          organizationId,
          campaignId: campaignId ?? null,
          businessName: place.name,
          phone: place.phone,
          address: place.address ?? null,
          status: "NEW",
        },
      });
      created.push(lead.id);
      await recordUsage(organizationId, "lead", 1);
    }

    return res.json({ created: created.length, skipped, leadIds: created });
  } catch (error: any) {
    if (error instanceof QuotaError) {
      return res.status(402).json({ error: "quota_exceeded", message: error.message });
    }
    if (error instanceof QuotaExceededError || error?.name === "QuotaExceededError") {
      return res.status(429).json({
        error: "quota_exceeded",
        message: error.message,
        kind: error.kind,
        current: error.current,
        limit: error.limit,
        units: error.units,
      });
    }
    console.error("[lead-service] /internal/scrape error:", error);
    res.status(500).json({ error: "Scrape failed" });
  }
});

export default router;
