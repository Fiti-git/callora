/**
 * Demo call route — ported from backend/src/routes/demo.ts.
 *
 * Phase-5 architecture differences vs the monolith:
 *   - Vapi keys are platform-managed (PAYG), not BYOK. We use the in-service
 *     `VapiService` which lazily resolves the platform key.
 *   - Gemini qualification is delegated to lead-service via internal HTTP
 *     (`POST /internal/qualify`) so calling-service does not need its own
 *     Gemini client.
 *
 * Behaviour preserved:
 *   - GET  /api/demo/history  → last 10 demo calls for the org
 *   - POST /api/demo/call     → place a one-shot call against the __DEMO__
 *                               campaign and return the call result + AI
 *                               qualification analysis.
 */
import express, { Request, Response } from "express";
import { prisma, QuotaError, QuotaExceededError } from "@callora/shared";
import { authenticate, AuthRequest } from "../middleware/requireAuth.js";
import { VapiService } from "../services/vapi.js";

const router = express.Router();
router.use(authenticate);

const LEAD_SERVICE_URL =
  process.env.LEAD_SERVICE_URL || "http://lead-service:4003";

interface DemoCallBody {
  phone?: string;
  name?: string;
  description?: string;
  firstMessage?: string;
}

function validateDemoBody(body: unknown): { ok: true; data: Required<Pick<DemoCallBody, "phone" | "name">> & DemoCallBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing body" };
  const b = body as DemoCallBody;
  if (typeof b.phone !== "string" || b.phone.length < 7) {
    return { ok: false, error: "Invalid 'phone' (min length 7)" };
  }
  if (typeof b.name !== "string" || b.name.length < 1) {
    return { ok: false, error: "Invalid 'name'" };
  }
  return { ok: true, data: { phone: b.phone, name: b.name, description: b.description, firstMessage: b.firstMessage } };
}

// GET /demo/history — last 10 demo calls for this org
router.get("/history", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const demoCampaign = await prisma.campaign.findFirst({
      where: { organizationId, name: "__DEMO__" },
    });
    if (!demoCampaign) return res.json([]);

    const logs = await prisma.callLog.findMany({
      where: { lead: { campaignId: demoCampaign.id, organizationId } },
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
  const { organizationId } = (req as AuthRequest).user!;
  const validated = validateDemoBody(req.body);
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
  }
  const { phone, name, description } = validated.data;

  try {
    // Load org for AI caller config — Vapi keys come from the platform, so
    // we no longer require BYOK keys to be present.
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });

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
        // Demo calls assume tenant-supplied number → mark consent so the
        // standard preflight does not block the call.
        consentGiven: true,
      },
    });

    const vapi = new VapiService();
    const orgAiConfig = {
      aiCallerName: org.aiCallerName,
      aiCallerCompany: org.aiCallerCompany,
      aiCallerPhone: org.aiCallerPhone,
      aiSystemPrompt: org.aiSystemPrompt,
    };

    const callResult = await vapi.makeCall(phone, name, orgAiConfig, organizationId);

    let analysis: {
      interestScore: number;
      isQualified: boolean;
      sentiment: string;
      summary: string;
      nextSteps: string;
    } = {
      interestScore: 0,
      isQualified: false,
      sentiment: "NEUTRAL",
      summary: callResult.summary ?? "Call did not complete.",
      nextSteps: "Try calling again.",
    };

    // CallLog: keyed by vapiCallId so the webhook can upsert it later.
    if (callResult.vapiCallId) {
      await prisma.callLog.upsert({
        where: { vapiCallId: callResult.vapiCallId },
        create: {
          leadId: lead.id,
          duration: callResult.durationSeconds,
          status: callResult.status,
          transcript: callResult.transcript,
          summary: analysis.summary,
          vapiCallId: callResult.vapiCallId,
          cost: callResult.cost ?? null,
          costBreakdown: (callResult.costBreakdown as any) ?? undefined,
        },
        update: { leadId: lead.id, status: callResult.status },
      });
    } else {
      await prisma.callLog.create({
        data: {
          leadId: lead.id,
          duration: callResult.durationSeconds,
          status: callResult.status,
          transcript: callResult.transcript,
          summary: analysis.summary,
          cost: callResult.cost ?? null,
          costBreakdown: (callResult.costBreakdown as any) ?? undefined,
        },
      });
    }

    // Run qualification via lead-service if we have a transcript. Best-effort:
    // failure to reach lead-service must not break the demo response.
    if (callResult.status === "COMPLETED" && callResult.transcript) {
      try {
        const resp = await fetch(`${LEAD_SERVICE_URL}/internal/qualify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            organizationId,
            transcript: callResult.transcript,
          }),
        });
        if (resp.ok) {
          const data: any = await resp.json();
          analysis = {
            interestScore: data.interestScore ?? 0,
            isQualified: Boolean(data.isQualified),
            sentiment: data.sentiment ?? "NEUTRAL",
            summary: data.summary ?? analysis.summary,
            nextSteps: data.nextSteps ?? "Follow up.",
          };
        }
      } catch (err: any) {
        // Swallow — qualification is enrichment, not the user-visible action.
        console.error("[demo] qualify call failed:", err?.message);
      }
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "CALLED", interestScore: analysis.interestScore },
    });

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
    if (error instanceof QuotaError || error instanceof QuotaExceededError) {
      return res.status((error as any).status ?? 429).json({ error: error.message });
    }
    if (
      error?.name === "TrialCallCapExceededError" ||
      error?.name === "ConsentRequiredError" ||
      error?.name === "DNCBlockedError" ||
      error?.name === "NoAvailableNumberError"
    ) {
      return res.status(409).json({ error: error.message, code: error.name });
    }
    console.error("Demo call error:", error);
    res.status(500).json({ error: error?.message ?? "Demo call failed" });
  }
});

export default router;
