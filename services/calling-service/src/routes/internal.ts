import express, { Request, Response } from "express";
import { prisma } from "@callora/shared";
import { VapiService, VapiOrgConfig } from "../services/vapi.js";
import { numbersQueue } from "../lib/numberQueue.js";
import { requireInternalAuth } from "../middleware/internalAuth.js";

const router = express.Router();

// All /internal endpoints require the shared internal token (if configured).
router.use(requireInternalAuth);

/* ---------------------------------------------------------------- */
/* Number provisioning (async via BullMQ)                           */
/* ---------------------------------------------------------------- */

/**
 * POST /internal/numbers/provision { orgId }
 * Enqueues a "provision" job. Idempotent — the worker no-ops if the org
 * already has an ACTIVE OrgVapiNumber.
 */
router.post("/numbers/provision", async (req: Request, res: Response) => {
  const { orgId, areaCode } = (req.body ?? {}) as {
    orgId?: string;
    areaCode?: string;
  };
  if (!orgId) return res.status(400).json({ error: "orgId required" });
  const cleanAreaCode =
    typeof areaCode === "string" && /^\d{3}$/.test(areaCode) ? areaCode : undefined;
  const job = await numbersQueue.add(
    "provision",
    { orgId, areaCode: cleanAreaCode },
    { jobId: `provision:${orgId}` }
  );
  res.status(202).json({ enqueued: true, jobId: job.id });
});

/**
 * POST /internal/numbers/release { orgId }
 * Enqueues a "release" job.
 */
router.post("/numbers/release", async (req: Request, res: Response) => {
  const { orgId } = (req.body ?? {}) as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: "orgId required" });
  const job = await numbersQueue.add(
    "release",
    { orgId },
    { jobId: `release:${orgId}:${Date.now()}` }
  );
  res.status(202).json({ enqueued: true, jobId: job.id });
});

/**
 * POST /internal/numbers/pool { areaCode? }
 * Synchronously buys a new POOL number with the given area code.
 * Used by the platform-service admin pool-management UI.
 */
router.post("/numbers/pool", async (req: Request, res: Response) => {
  const { areaCode } = (req.body ?? {}) as { areaCode?: string };
  try {
    const { addPoolNumber } = await import("../services/numberProvisioner.js");
    const id = await addPoolNumber(areaCode);
    res.status(201).json({ id });
  } catch (err: any) {
    console.error("[/internal/numbers/pool] error:", {
      code: err?.code,
      message: err?.message,
    });
    res.status(500).json({ error: err?.message || "Failed to add pool number" });
  }
});

/**
 * POST /internal/numbers/pool/:id/rotate
 * Enqueues a rotate-one job for the given POOL row.
 */
router.post("/numbers/pool/:id/rotate", async (req: Request, res: Response) => {
  const { id } = req.params;
  const job = await numbersQueue.add(
    "rotate-one",
    { poolRowId: id },
    { jobId: `rotate-one:${id}:${Date.now()}` }
  );
  res.status(202).json({ enqueued: true, jobId: job.id });
});

/**
 * GET /internal/numbers/:orgId
 * Returns the org's currently assigned number (ACTIVE row only).
 */
router.get("/numbers/:orgId", async (req: Request, res: Response) => {
  const { orgId } = req.params;
  const row = await prisma.orgVapiNumber.findUnique({
    where: { organizationId: orgId },
  });
  if (!row) return res.status(404).json({ error: "no number for org" });
  res.json({
    organizationId: row.organizationId,
    vapiPhoneNumberId: row.vapiPhoneNumberId,
    e164: row.e164,
    status: row.status,
    areaCode: row.areaCode,
    provisionedAt: row.provisionedAt,
    releasedAt: row.releasedAt,
  });
});

/* ---------------------------------------------------------------- */
/* Legacy synchronous provisioning (kept for billing-service callers) */
/* ---------------------------------------------------------------- */

/**
 * POST /internal/provision-number — synchronous variant retained for
 * backwards compatibility. Prefer POST /internal/numbers/provision.
 */
router.post("/provision-number", async (req: Request, res: Response) => {
  const { organizationId } = (req.body ?? {}) as { organizationId?: string };
  if (!organizationId) {
    return res.status(400).json({ error: "organizationId is required" });
  }
  try {
    const { provisionDedicated } = await import(
      "../services/numberProvisioner.js"
    );
    const out = await provisionDedicated(organizationId);
    res.json({
      phoneNumberId: out.vapiPhoneNumberId,
      phoneNumber: out.e164,
      alreadyProvisioned: out.alreadyProvisioned,
    });
  } catch (err: any) {
    console.error("[/internal/provision-number] error:", {
      code: err?.code,
      message: err?.message,
    });
    res.status(500).json({ error: "Phone number provisioning failed" });
  }
});

/* ---------------------------------------------------------------- */
/* Place a call                                                     */
/* ---------------------------------------------------------------- */

/**
 * POST /internal/call
 * Body: { leadId, organizationId, aiCallerName, aiCallerCompany,
 *         aiCallerPhone, aiSystemPrompt? }
 * Returns: { callLogId, vapiCallId }
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

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId },
    });
    if (!lead) {
      return res.status(404).json({ error: "Lead not found for organization" });
    }
    if (!lead.phone) {
      return res.status(400).json({ error: "Lead has no phone number" });
    }

    const orgConfig: VapiOrgConfig = {
      aiCallerName: aiCallerName || "Alex",
      aiCallerCompany: aiCallerCompany || "Callora",
      aiCallerPhone: aiCallerPhone || "",
      aiSystemPrompt: aiSystemPrompt ?? null,
    };

    const vapi = new VapiService();
    const { vapiCallId } = await vapi.initiateCall(
      lead.phone,
      lead.businessName,
      orgConfig,
      organizationId
    );

    const callLog = await prisma.callLog.upsert({
      where: { vapiCallId },
      update: { leadId: lead.id, status: "IN_PROGRESS" },
      create: {
        leadId: lead.id,
        duration: 0,
        status: "IN_PROGRESS",
        vapiCallId,
      },
    });

    return res.json({ callLogId: callLog.id, vapiCallId });
  } catch (err: any) {
    if (err?.name === "QuotaExceededError") {
      return res.status(429).json({
        error: "quota_exceeded",
        message: err.message,
        kind: err.kind,
        current: err.current,
        limit: err.limit,
        units: err.units,
      });
    }
    if (err?.name === "TrialCallCapExceededError") {
      return res.status(429).json({
        error: "trial_call_cap_exceeded",
        message: err.message,
        cap: err.cap,
      });
    }
    if (err?.name === "ConsentRequiredError") {
      return res.status(451).json({
        error: "consent_required",
        message: err.message,
        reason: err.reason,
        leadId: err.leadId,
      });
    }
    if (err?.name === "DNCBlockedError") {
      return res.status(451).json({
        error: "dnc_blocked",
        message: err.message,
        source: err.source,
        leadId: err.leadId,
      });
    }
    if (err?.name === "NoAvailableNumberError") {
      return res.status(503).json({
        error: "no_available_number",
        message: err.message,
      });
    }
    if (err?.name === "NumberNotProvisionedError") {
      return res.status(503).json({
        error: "number_not_provisioned",
        message: err.message,
      });
    }
    console.error("[/internal/call] error:", {
      code: err?.code,
      message: err?.message,
    });
    return res
      .status(500)
      .json({ error: err.message || "Failed to place call" });
  }
});

export default router;
