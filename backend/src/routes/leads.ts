import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";
import { writeAuditLog } from "../lib/audit.js";
import { enqueueAutomationRun } from "./emailMarketing.js";

const router = express.Router();

const scheduleFollowupSchema = z.object({
  type: z.enum(["PENDING_RETRY", "PENDING_FOLLOWUP"]),
  scheduledAt: z.string().datetime(),
});

router.use(authenticate);

// ---------------------------------------------------------------------------
// Bulk operations (Phase 2 Agent 7).
// ---------------------------------------------------------------------------
const bulkIdsSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(1000),
});
const bulkDisqualifySchema = bulkIdsSchema.extend({
  reason: z.string().min(1).max(500).optional(),
});

// Terminal states that bulk-qualify must skip (Lead.status is a free-form
// String column; the canonical happy-path values are NEW/CALLED/QUALIFIED/
// DISQUALIFIED/PENDING_*). WON/LOST are reserved for forward compatibility
// with deal-style outcomes attached to leads.
const QUALIFY_ELIGIBLE = ["NEW", "CALLED", "PENDING_RETRY", "PENDING_FOLLOWUP"];

router.post("/bulk-qualify", validateBody(bulkIdsSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids } = req.body as { ids: string[] };
  try {
    const result = await prisma.lead.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        status: { in: QUALIFY_ELIGIBLE },
      },
      data: { status: "QUALIFIED" },
    });
    const skipped = ids.length - result.count;

    // Phase 3 Agent 10 — fire LEAD_QUALIFIED automation triggers per-lead.
    if (result.count > 0) {
      const qualified = await prisma.lead.findMany({
        where: { id: { in: ids }, organizationId, status: "QUALIFIED" },
        select: { id: true, contactId: true, businessName: true, phone: true },
      });
      for (const l of qualified) {
        await enqueueAutomationRun(organizationId, "LEAD_QUALIFIED", {
          contactId: l.contactId,
          data: { leadId: l.id, businessName: l.businessName, phone: l.phone ?? null },
        }).catch(() => {});
      }
    }
    await writeAuditLog(
      req,
      "LEAD_BULK_QUALIFY",
      "Lead",
      ids.join(",").slice(0, 200),
      { qualified: result.count, skipped, requested: ids.length }
    );
    res.json({ qualified: result.count, skipped });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk-disqualify", validateBody(bulkDisqualifySchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids, reason } = req.body as { ids: string[]; reason?: string };
  try {
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids }, organizationId },
      data: { status: "DISQUALIFIED" },
    });
    await writeAuditLog(
      req,
      "LEAD_BULK_DISQUALIFY",
      "Lead",
      ids.join(",").slice(0, 200),
      { disqualified: result.count, requested: ids.length, reason: reason ?? null }
    );
    res.json({ disqualified: result.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// TCPA consent + do-not-call (Phase 2 Agent 9).
// ---------------------------------------------------------------------------
const consentSchema = z.object({
  source: z.enum(["WEB_FORM", "API", "CSV_IMPORT", "MANUAL", "OPT_IN_CALL"]),
  ipAddress: z.string().optional(),
});
const dncSchema = z.object({
  reason: z.string().min(1).max(500),
});

router.post("/:id/consent", validateBody(consentSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { source, ipAddress } = req.body as { source: string; ipAddress?: string };
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const ip = ipAddress || req.ip || (req.headers["x-forwarded-for"] as string | undefined) || null;
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        consentGiven: true,
        consentTimestamp: new Date(),
        consentSource: source,
        consentIpAddress: ip,
      },
    });
    await writeAuditLog(req, "LEAD_CONSENT_GRANTED", "Lead", lead.id, {
      source,
      ipAddress: ip,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/do-not-call", validateBody(dncSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { reason } = req.body as { reason: string };
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { doNotCall: true, doNotCallReason: reason, doNotCallAt: new Date() },
    });
    await writeAuditLog(req, "LEAD_DO_NOT_CALL", "Lead", lead.id, { reason });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const bulkConsentSchema = bulkIdsSchema.extend({
  source: z.enum(["WEB_FORM", "API", "CSV_IMPORT", "MANUAL", "OPT_IN_CALL"]),
});
const bulkDncSchema = bulkIdsSchema.extend({
  reason: z.string().min(1).max(500),
});

router.post("/bulk-consent", validateBody(bulkConsentSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids, source } = req.body as { ids: string[]; source: string };
  try {
    const ip = req.ip || null;
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids }, organizationId },
      data: {
        consentGiven: true,
        consentTimestamp: new Date(),
        consentSource: source,
        consentIpAddress: ip,
      },
    });
    await writeAuditLog(req, "LEAD_BULK_CONSENT", "Lead", ids.join(",").slice(0, 200), {
      count: result.count,
      requested: ids.length,
      source,
    });
    res.json({ updated: result.count, requested: ids.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk-do-not-call", validateBody(bulkDncSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids, reason } = req.body as { ids: string[]; reason: string };
  try {
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids }, organizationId },
      data: { doNotCall: true, doNotCallReason: reason, doNotCallAt: new Date() },
    });
    await writeAuditLog(req, "LEAD_BULK_DO_NOT_CALL", "Lead", ids.join(",").slice(0, 200), {
      count: result.count,
      requested: ids.length,
      reason,
    });
    res.json({ updated: result.count, requested: ids.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk-delete", validateBody(bulkIdsSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids } = req.body as { ids: string[] };
  try {
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(
      req,
      "LEAD_BULK_DELETE",
      "Lead",
      ids.join(",").slice(0, 200),
      { count: result.count, requested: ids.length }
    );
    res.json({ deleted: result.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /leads?status=PENDING_RETRY,PENDING_FOLLOWUP (optional comma-separated filter)
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const statusFilter = req.query.status as string | undefined;

  try {
    const where: any = { organizationId };
    if (statusFilter) {
      const statuses = statusFilter.split(",").map((s) => s.trim());
      where.status = { in: statuses };
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { campaign: true, calls: true },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    res.json(leads);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /leads/:id/schedule-followup — manually schedule a follow-up for any lead
router.patch("/:id/schedule-followup", validateBody(scheduleFollowupSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { type, scheduledAt } = req.body as {
    type: "PENDING_RETRY" | "PENDING_FOLLOWUP";
    scheduledAt: string;
  };

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id, organizationId },
    });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const date = new Date(scheduledAt);

    const updated = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        status: type,
        nextCallAt: type === "PENDING_RETRY" ? date : null,
        followUpAt: type === "PENDING_FOLLOWUP" ? date : null,
      },
      include: { campaign: true },
    });

    await writeAuditLog(req, "LEAD_STATUS_CHANGE", "Lead", req.params.id, {
      status: type,
      scheduledAt,
      statusFrom: lead.status,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /leads/:id — soft-delete. Auto-filtered out of subsequent list/get.
router.delete("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const result = await prisma.lead.updateMany({
      where: { id: req.params.id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) return res.status(404).json({ error: "Lead not found" });
    await writeAuditLog(req, "LEAD_DELETE", "Lead", req.params.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /leads/:id
router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id, organizationId },
      include: { campaign: true, calls: true },
    });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(lead);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
