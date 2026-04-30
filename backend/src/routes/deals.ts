import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";
import { writeAuditLog } from "../lib/audit.js";
import { recordDealStageChange } from "../lib/dealHistory.js";
import { enqueueAutomationRun } from "./emailMarketing.js";
import { emitTenantEvent } from "../lib/webhookEmit.js";

const router = express.Router();

const STAGES = ["PROSPECT", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
const createSchema = z.object({
  title: z.string().min(1).max(200),
  contactId: z.string().cuid(),
  value: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  probability: z.number().min(0).max(100).optional().nullable(),
  stage: z.enum(STAGES).optional(),
  closeDate: z.string().datetime().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
});
const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  value: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  probability: z.number().min(0).max(100).optional().nullable(),
  stage: z.enum(STAGES).optional(),
  closeDate: z.string().datetime().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
});

router.use(authenticate);

// ---------------------------------------------------------------------------
// Bulk operations (Phase 2 Agent 7).
// ---------------------------------------------------------------------------
const bulkIdsSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(1000),
});
const bulkStatusSchema = bulkIdsSchema.extend({
  status: z.enum(STAGES),
});
const bulkAssignSchema = bulkIdsSchema.extend({
  ownerId: z.string().cuid(),
});

router.post("/bulk-status", validateBody(bulkStatusSchema), async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const { ids, status } = req.body as { ids: string[]; status: string };
  try {
    const before = await prisma.deal.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, stage: true },
    });
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      const r = await tx.deal.updateMany({
        where: { id: { in: ids }, organizationId },
        data: { stage: status },
      });
      updated = r.count;
      for (const row of before) {
        if (row.stage !== status) {
          await recordDealStageChange(tx, {
            dealId: row.id,
            organizationId,
            fromStage: row.stage,
            toStage: status,
            changedById: userId,
            reason: "bulk-status",
          });
        }
      }
    });
    // Phase 3 Agent 10 — fire DEAL_WON automations on transitions to WON.
    if (status === "WON") {
      const wonIds = before.filter((b) => b.stage !== "WON").map((b) => b.id);
      if (wonIds.length) {
        const wonDeals = await prisma.deal.findMany({
          where: { id: { in: wonIds }, organizationId },
          select: { id: true, contactId: true, contact: { select: { email: true, businessName: true } } },
        });
        for (const d of wonDeals) {
          await enqueueAutomationRun(organizationId, "DEAL_WON", {
            contactId: d.contactId,
            email: d.contact?.email ?? null,
            data: { dealId: d.id, businessName: d.contact?.businessName ?? null },
          }).catch(() => {});
          await emitTenantEvent(organizationId, "DEAL_WON", {
            dealId: d.id,
            contactId: d.contactId,
            businessName: d.contact?.businessName ?? null,
            email: d.contact?.email ?? null,
          });
        }
      }
    }
    await writeAuditLog(
      req,
      "DEAL_BULK_STATUS",
      "Deal",
      ids.join(",").slice(0, 200),
      { count: updated, status }
    );
    res.json({ updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk-assign", validateBody(bulkAssignSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids, ownerId } = req.body as { ids: string[]; ownerId: string };
  try {
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, organizationId },
      select: { id: true },
    });
    if (!owner) {
      return res.status(400).json({ error: "INVALID_OWNER", message: "ownerId is not a member of this organization" });
    }
    const result = await prisma.deal.updateMany({
      where: { id: { in: ids }, organizationId },
      data: { ownerId, assignedToId: ownerId },
    });
    await writeAuditLog(
      req,
      "DEAL_BULK_ASSIGN",
      "Deal",
      ids.join(",").slice(0, 200),
      { count: result.count, ownerId }
    );
    res.json({ updated: result.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { contactId, stage } = req.query;
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const deals = await prisma.deal.findMany({
      where: {
        organizationId,
        ...(contactId ? { contactId: String(contactId) } : {}),
        ...(stage ? { stage: String(stage) } : {}),
      },
      include: {
        contact: { select: { id: true, businessName: true, phone: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    res.json(deals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const deal = await prisma.deal.findFirst({
      where: { id: req.params.id, organizationId },
      include: {
        contact: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
    if (!deal) return res.status(404).json({ error: "Not found" });
    res.json(deal);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", validateBody(createSchema), async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const { title, contactId, value, probability, stage, closeDate, notes, assignedToId } = req.body;
  try {
    const initialStage = stage ?? "PROSPECT";
    const deal = await prisma.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: {
          title,
          contactId,
          value,
          probability,
          stage: initialStage,
          closeDate: closeDate ? new Date(closeDate) : null,
          notes,
          assignedToId: assignedToId ?? null,
          organizationId,
        },
      });
      await recordDealStageChange(tx, {
        dealId: created.id,
        organizationId,
        fromStage: null,
        toStage: initialStage,
        changedById: userId,
      });
      return created;
    });
    await writeAuditLog(req, "DEAL_CREATE", "Deal", deal.id, {
      title,
      stage: initialStage,
      value: value ?? null,
    });
    res.status(201).json(deal);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", validateBody(updateSchema), async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const { title, value, probability, stage, closeDate, notes, assignedToId } = req.body;
  try {
    // Snapshot the prior stage so we can record stage transitions cleanly.
    const before = await prisma.deal.findFirst({
      where: { id: req.params.id, organizationId },
      select: { stage: true },
    });
    const result = await prisma.$transaction(async (tx) => {
      const r = await tx.deal.updateMany({
        where: { id: req.params.id, organizationId },
        data: {
          title,
          value,
          probability,
          stage,
          closeDate: closeDate ? new Date(closeDate) : undefined,
          notes,
          assignedToId,
        },
      });
      if (r.count > 0 && stage !== undefined && before && before.stage !== stage) {
        await recordDealStageChange(tx, {
          dealId: req.params.id,
          organizationId,
          fromStage: before.stage,
          toStage: stage,
          changedById: userId,
        });
      }
      return r;
    });
    // Phase 3 Agent 10 — DEAL_WON automation trigger.
    if (
      result.count > 0 &&
      stage === "WON" &&
      before &&
      before.stage !== "WON"
    ) {
      const d = await prisma.deal.findFirst({
        where: { id: req.params.id, organizationId },
        select: { id: true, contactId: true, contact: { select: { email: true, businessName: true } } },
      });
      if (d) {
        await enqueueAutomationRun(organizationId, "DEAL_WON", {
          contactId: d.contactId,
          email: d.contact?.email ?? null,
          data: { dealId: d.id, businessName: d.contact?.businessName ?? null },
        }).catch(() => {});
        await emitTenantEvent(organizationId, "DEAL_WON", {
          dealId: d.id,
          contactId: d.contactId,
          businessName: d.contact?.businessName ?? null,
          email: d.contact?.email ?? null,
        });
      }
    }
    if (result.count > 0) {
      const diff: Record<string, unknown> = {};
      if (title !== undefined) diff.title = title;
      if (value !== undefined) diff.value = value;
      if (probability !== undefined) diff.probability = probability;
      if (stage !== undefined) {
        diff.stage = stage;
        if (before && before.stage !== stage) {
          diff.stageFrom = before.stage;
        }
      }
      if (closeDate !== undefined) diff.closeDate = closeDate;
      if (notes !== undefined) diff.notes = notes;
      if (assignedToId !== undefined) diff.assignedToId = assignedToId;
      await writeAuditLog(
        req,
        stage !== undefined && before && before.stage !== stage
          ? "DEAL_STAGE_CHANGE"
          : "DEAL_UPDATE",
        "Deal",
        req.params.id,
        diff
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Activity timeline for a deal. Same shape as the contact timeline:
// CALL / NOTE / TASK_COMPLETED / DEAL_STAGE_CHANGE / EMAIL_SENT.
router.get("/:id/timeline", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

  const deal = await prisma.deal.findFirst({
    where: { id: req.params.id, organizationId },
    include: { contact: { include: { leads: { select: { id: true } } } } },
  });
  if (!deal) return res.status(404).json({ error: "Not found" });

  try {
    const before = cursor ? { lt: cursor } : undefined;
    const leadIds = deal.contact?.leads?.map((l) => l.id) ?? [];

    const [calls, notes, tasks, dealHistory, emails] = await Promise.all([
      leadIds.length
        ? prisma.callLog.findMany({
            where: { leadId: { in: leadIds }, ...(before ? { createdAt: before } : {}) },
            orderBy: { createdAt: "desc" },
            take: limit + 1,
          })
        : [],
      prisma.note.findMany({
        where: { contactId: deal.contactId, organizationId, ...(before ? { createdAt: before } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      }),
      prisma.task.findMany({
        where: {
          contactId: deal.contactId,
          organizationId,
          completedAt: { not: null, ...(before ?? {}) },
        },
        orderBy: { completedAt: "desc" },
        take: limit + 1,
      }),
      prisma.dealHistory.findMany({
        where: { dealId: deal.id, organizationId, ...(before ? { createdAt: before } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      }),
      deal.contact?.email
        ? prisma.emailLog.findMany({
            where: {
              organizationId,
              recipient: deal.contact.email,
              ...(before ? { createdAt: before } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: limit + 1,
          })
        : [],
    ]);

    type TLE = { type: string; at: Date; sourceId: string; payload: Record<string, unknown> };
    const events: TLE[] = [];
    for (const c of calls) events.push({ type: "CALL", at: c.createdAt, sourceId: c.id, payload: { leadId: c.leadId, duration: c.duration, status: c.status, summary: c.summary ?? null } });
    for (const n of notes) events.push({ type: "NOTE", at: n.createdAt, sourceId: n.id, payload: { content: n.content, noteType: n.type, authorId: n.authorId } });
    for (const t of tasks) {
      if (!t.completedAt) continue;
      events.push({ type: "TASK_COMPLETED", at: t.completedAt, sourceId: t.id, payload: { title: t.title, assignedToId: t.assignedToId } });
    }
    for (const h of dealHistory) events.push({ type: "DEAL_STAGE_CHANGE", at: h.createdAt, sourceId: h.id, payload: { dealId: h.dealId, fromStage: h.fromStage, toStage: h.toStage, reason: h.reason } });
    for (const e of emails) events.push({ type: "EMAIL_SENT", at: e.createdAt, sourceId: e.id, payload: { subject: e.subject, status: e.status, template: e.template } });

    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    res.json({
      events: events.slice(0, limit),
      nextCursor: events.length > limit ? events[limit - 1].at : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const result = await prisma.deal.updateMany({
      where: { id: req.params.id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    await writeAuditLog(req, "DEAL_DELETE", "Deal", req.params.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
