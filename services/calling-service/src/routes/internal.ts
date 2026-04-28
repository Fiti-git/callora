import express, { Request, Response } from "express";
import { prisma } from "@callora/shared";
import { VapiService, VapiOrgConfig } from "../services/vapi.js";
import { VapiProvisioningService } from "../services/vapiProvisioning.js";

const router = express.Router();

// Platform-owned Vapi credentials. Tenants no longer supply their own.
const VAPI_KEY = process.env.VAPI_PRIVATE_KEY!;
// Fallback phone ID used in local dev before a number is provisioned per-org
const VAPI_PHONE_ID_FALLBACK = process.env.VAPI_PHONE_NUMBER_ID ?? "";

/**
 * POST /internal/provision-number
 *
 * Called by billing-service after Stripe checkout.session.completed.
 * Buys a dedicated Vapi phone number for the org and persists the result.
 *
 * Body: { organizationId: string, orgName: string, areaCode?: string }
 * Returns: { phoneNumberId, phoneNumber }
 */
router.post("/provision-number", async (req: Request, res: Response) => {
  const { organizationId, orgName, areaCode } = req.body as {
    organizationId?: string;
    orgName?: string;
    areaCode?: string;
  };

  if (!organizationId || !orgName) {
    return res.status(400).json({ error: "organizationId and orgName are required" });
  }

  if (!VAPI_KEY) {
    return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured on platform" });
  }

  try {
    // Idempotent — if the org already has a number, return it
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { vapiPhoneNumberId: true, vapiPhoneNumber: true },
    });

    if (org?.vapiPhoneNumberId && org?.vapiPhoneNumber) {
      return res.json({
        phoneNumberId: org.vapiPhoneNumberId,
        phoneNumber: org.vapiPhoneNumber,
        alreadyProvisioned: true,
      });
    }

    const provisioner = new VapiProvisioningService(VAPI_KEY);
    const { id, number } = await provisioner.buyPhoneNumber(orgName, areaCode ?? "415");

    await prisma.organization.update({
      where: { id: organizationId },
      data: { vapiPhoneNumberId: id, vapiPhoneNumber: number },
    });

    console.log(`[calling-service] provisioned number ${number} (${id}) for org ${organizationId}`);
    return res.json({ phoneNumberId: id, phoneNumber: number });
  } catch (err: any) {
    console.error("[calling-service] /internal/provision-number error:", err?.response?.data ?? err.message);
    res.status(500).json({ error: "Phone number provisioning failed", detail: err?.response?.data ?? err.message });
  }
});

/**
 * POST /internal/call
 * Body: { leadId, organizationId, aiCallerName, aiCallerCompany,
 *         aiCallerPhone, aiSystemPrompt? }
 * Returns: { callLogId, vapiCallId }
 *
 * Vapi credentials are read from process.env (VAPI_PRIVATE_KEY /
 * VAPI_PHONE_NUMBER_ID) — they are platform-level, not tenant-supplied.
 */
router.post("/call", async (req: Request, res: Response) => {
  try {
    const {
      leadId,
      organizationId,
      aiCallerName,
      aiCallerCompany,
      aiCallerPhone,
      aiSystemPrompt,
    } = req.body || {};

    if (!leadId || !organizationId) {
      return res.status(400).json({
        error: "Missing required fields: leadId, organizationId",
      });
    }

    if (!VAPI_KEY) {
      return res.status(500).json({
        error: "Platform Vapi credentials are not configured (VAPI_PRIVATE_KEY)",
      });
    }

    const [lead, org] = await Promise.all([
      prisma.lead.findFirst({ where: { id: leadId, organizationId } }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { vapiPhoneNumberId: true },
      }),
    ]);

    if (!lead) {
      return res.status(404).json({ error: "Lead not found for organization" });
    }
    if (!lead.phone) {
      return res.status(400).json({ error: "Lead has no phone number" });
    }

    // Use the org-specific provisioned number, fall back to env var for local dev
    const phoneNumberId = org?.vapiPhoneNumberId || VAPI_PHONE_ID_FALLBACK;
    if (!phoneNumberId) {
      return res.status(500).json({
        error: "No Vapi phone number provisioned for this organization. Complete Stripe checkout first.",
      });
    }

    const orgConfig: VapiOrgConfig = {
      aiCallerName: aiCallerName || "Alex",
      aiCallerCompany: aiCallerCompany || "Callora",
      aiCallerPhone: aiCallerPhone || "",
      aiSystemPrompt: aiSystemPrompt ?? null,
    };

    const vapi = new VapiService(VAPI_KEY, phoneNumberId);
    const { vapiCallId } = await vapi.initiateCall(
      lead.phone,
      lead.businessName,
      orgConfig
    );

    const callLog = await prisma.callLog.create({
      data: {
        leadId: lead.id,
        duration: 0,
        status: "IN_PROGRESS",
        vapiCallId,
      },
    });

    return res.json({ callLogId: callLog.id, vapiCallId });
  } catch (err: any) {
    console.error("[/internal/call] error:", err.response?.data || err.message);
    return res
      .status(500)
      .json({ error: err.message || "Failed to place call" });
  }
});

/**
 * GET /internal/call-result/:vapiCallId?organizationId=...
 *
 * Checks Vapi for the live status of a call, updates the CallLog row if the
 * call has ended, and returns the result to the campaign worker for polling.
 *
 * Uses platform Vapi credentials from env. No per-org ApiKey is needed.
 */
router.get("/call-result/:vapiCallId", async (req: Request, res: Response) => {
  try {
    const { vapiCallId } = req.params;
    const organizationId = req.query.organizationId as string | undefined;

    if (!vapiCallId) {
      return res.status(400).json({ error: "vapiCallId is required" });
    }
    if (!VAPI_KEY) {
      return res.status(500).json({ error: "VAPI_PRIVATE_KEY not configured" });
    }

    // Load the existing CallLog so we can fall back to stored values
    const log = await prisma.callLog.findFirst({
      where: {
        vapiCallId,
        ...(organizationId
          ? { lead: { organizationId } }
          : {}),
      },
    });

    if (!log) {
      return res.status(404).json({ error: "CallLog not found" });
    }

    const vapi = new VapiService(VAPI_KEY, VAPI_PHONE_ID_FALLBACK);
    const result = await vapi.fetchCallStatus(vapiCallId);

    if (result.status !== "IN_PROGRESS") {
      await prisma.callLog.update({
        where: { id: log.id },
        data: {
          status: result.status,
          duration: result.durationSeconds,
          transcript: result.transcript ?? log.transcript,
          summary: result.summary ?? log.summary,
          cost: result.cost ?? log.cost,
          costBreakdown: (result.costBreakdown as any) ?? (log as any).costBreakdown,
        },
      });
    }

    return res.json({
      status: result.status === "IN_PROGRESS" ? log.status : result.status,
      duration: result.status === "IN_PROGRESS" ? log.duration : result.durationSeconds,
      transcript: result.transcript ?? log.transcript ?? undefined,
      summary: result.summary ?? log.summary ?? undefined,
      cost: result.cost ?? log.cost ?? undefined,
    });
  } catch (err: any) {
    console.error("[calling-service] /internal/call-result error:", err);
    res.status(500).json({ error: "Failed to fetch call status" });
  }
});

export default router;
