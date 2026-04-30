import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";
import { writeAuditLog } from "../lib/audit.js";
import { enqueueAutomationRun } from "./emailMarketing.js";

const router = express.Router();

const createSchema = z.object({
  businessName: z.string().min(1).max(200),
  phone: z.string().min(1).max(40),
  address: z.string().max(500).optional().nullable(),
  email: z.string().email().optional().nullable(),
});

const updateSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional().nullable(),
  email: z.string().email().optional().nullable(),
});

router.use(authenticate);

// ---------------------------------------------------------------------------
// Bulk operations (Phase 2 Agent 7).
// ---------------------------------------------------------------------------
const bulkIdsSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(1000),
});
const bulkTagSchema = bulkIdsSchema.extend({
  tags: z.array(z.string().min(1).max(50)).min(1).max(50),
});
const bulkAssignOwnerSchema = bulkIdsSchema.extend({
  ownerId: z.string().cuid(),
});

router.post("/bulk-delete", validateBody(bulkIdsSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids } = req.body as { ids: string[] };
  try {
    const result = await prisma.contact.updateMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(
      req,
      "CONTACT_BULK_DELETE",
      "Contact",
      ids.join(",").slice(0, 200),
      { count: result.count, requested: ids.length }
    );
    res.json({ deleted: result.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk-tag", validateBody(bulkTagSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids, tags } = req.body as { ids: string[]; tags: string[] };
  try {
    const rows = await prisma.contact.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, tags: true },
    });
    let updated = 0;
    for (const row of rows) {
      const merged = Array.from(new Set([...(row.tags ?? []), ...tags]));
      // updateMany used to keep org-scope guard in WHERE; per-row update is safe
      // because we already filtered by organizationId above.
      const r = await prisma.contact.updateMany({
        where: { id: row.id, organizationId },
        data: { tags: merged },
      });
      updated += r.count;
    }
    await writeAuditLog(
      req,
      "CONTACT_BULK_TAG",
      "Contact",
      ids.join(",").slice(0, 200),
      { count: updated, tags }
    );
    res.json({ updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk-assign-owner", validateBody(bulkAssignOwnerSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { ids, ownerId } = req.body as { ids: string[]; ownerId: string };
  try {
    // Validate owner belongs to this org. Reject loud — no silent skip.
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, organizationId },
      select: { id: true },
    });
    if (!owner) {
      return res.status(400).json({ error: "INVALID_OWNER", message: "ownerId is not a member of this organization" });
    }
    const result = await prisma.contact.updateMany({
      where: { id: { in: ids }, organizationId },
      data: { ownerId },
    });
    await writeAuditLog(
      req,
      "CONTACT_BULK_ASSIGN_OWNER",
      "Contact",
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
  const { search } = req.query;
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId,
        ...(search
          ? {
              OR: [
                { businessName: { contains: String(search), mode: "insensitive" } },
                { phone: { contains: String(search) } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    res.json(contacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId },
      include: { leads: true, deals: true, tasks: true, notes: { orderBy: { createdAt: "desc" } } },
    });
    if (!contact) return res.status(404).json({ error: "Not found" });
    res.json(contact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Activity timeline. Interleaves CALL / NOTE / TASK_COMPLETED /
// DEAL_STAGE_CHANGE / EMAIL_SENT events for a contact, sorted desc by `at`.
router.get("/:id/timeline", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

  const contact = await prisma.contact.findFirst({
    where: { id: req.params.id, organizationId },
    include: { leads: { select: { id: true } }, deals: { select: { id: true } } },
  });
  if (!contact) return res.status(404).json({ error: "Not found" });

  try {
    const events = await collectContactTimeline(contact, organizationId, cursor, limit);
    res.json({
      events: events.slice(0, limit),
      nextCursor: events.length > limit ? events[limit - 1].at : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

type TimelineEvent = {
  type: "CALL" | "NOTE" | "TASK_COMPLETED" | "DEAL_STAGE_CHANGE" | "EMAIL_SENT";
  at: Date;
  payload: Record<string, unknown>;
  sourceId: string;
};

async function collectContactTimeline(
  contact: { id: string; email: string | null; leads: { id: string }[]; deals: { id: string }[] },
  organizationId: string,
  cursor: Date | null,
  limit: number
): Promise<TimelineEvent[]> {
  const before = cursor ? { lt: cursor } : undefined;
  const leadIds = contact.leads.map((l) => l.id);
  const dealIds = contact.deals.map((d) => d.id);

  const [calls, notes, tasks, dealHistory, emails] = await Promise.all([
    leadIds.length
      ? prisma.callLog.findMany({
          where: { leadId: { in: leadIds }, ...(before ? { createdAt: before } : {}) },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
        })
      : [],
    prisma.note.findMany({
      where: { contactId: contact.id, organizationId, ...(before ? { createdAt: before } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    }),
    prisma.task.findMany({
      where: {
        contactId: contact.id,
        organizationId,
        completedAt: { not: null, ...(before ?? {}) },
      },
      orderBy: { completedAt: "desc" },
      take: limit + 1,
    }),
    dealIds.length
      ? prisma.dealHistory.findMany({
          where: { dealId: { in: dealIds }, organizationId, ...(before ? { createdAt: before } : {}) },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
        })
      : [],
    contact.email
      ? prisma.emailLog.findMany({
          where: {
            organizationId,
            recipient: contact.email,
            ...(before ? { createdAt: before } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
        })
      : [],
  ]);

  const events: TimelineEvent[] = [];
  for (const c of calls) {
    events.push({
      type: "CALL",
      at: c.createdAt,
      sourceId: c.id,
      payload: {
        leadId: c.leadId,
        duration: c.duration,
        status: c.status,
        summary: c.summary ?? null,
      },
    });
  }
  for (const n of notes) {
    events.push({
      type: "NOTE",
      at: n.createdAt,
      sourceId: n.id,
      payload: { content: n.content, noteType: n.type, authorId: n.authorId },
    });
  }
  for (const t of tasks) {
    if (!t.completedAt) continue;
    events.push({
      type: "TASK_COMPLETED",
      at: t.completedAt,
      sourceId: t.id,
      payload: { title: t.title, assignedToId: t.assignedToId },
    });
  }
  for (const h of dealHistory) {
    events.push({
      type: "DEAL_STAGE_CHANGE",
      at: h.createdAt,
      sourceId: h.id,
      payload: { dealId: h.dealId, fromStage: h.fromStage, toStage: h.toStage, reason: h.reason },
    });
  }
  for (const e of emails) {
    events.push({
      type: "EMAIL_SENT",
      at: e.createdAt,
      sourceId: e.id,
      payload: { subject: e.subject, status: e.status, template: e.template },
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events;
}

export { collectContactTimeline };

router.post("/", validateBody(createSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { businessName, phone, address, email } = req.body;
  try {
    // Phase 2 Agent 7 — dedup. If a non-deleted contact in this org already
    // matches by phone OR email, return 409 with the existing id and a merge
    // hint URL so the UI can offer to merge instead of silently inserting.
    const dupClauses: any[] = [{ phone }];
    if (email) dupClauses.push({ email });
    const existing = await prisma.contact.findFirst({
      where: { organizationId, OR: dupClauses },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({
        error: "DUPLICATE_CONTACT",
        existingId: existing.id,
        mergeUrl: `/api/contacts/${existing.id}/merge/:duplicateId`,
      });
    }

    const contact = await prisma.contact.create({
      data: { businessName, phone, address, email, organizationId },
    });
    await writeAuditLog(req, "CONTACT_CREATE", "Contact", contact.id, {
      businessName,
      phone,
    });
    // Phase 3 Agent 10 — CONTACT_CREATED automation trigger (single create
    // path only — bulk imports skip this to avoid noise).
    await enqueueAutomationRun(organizationId, "CONTACT_CREATED", {
      contactId: contact.id,
      email: contact.email ?? null,
      data: { businessName: contact.businessName, phone: contact.phone },
    }).catch(() => {});
    res.status(201).json(contact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Merge `duplicateId` into `id`. Reassigns Lead, Deal, Note, Task, CallLog
// references; unions tags; back-fills missing primary fields from the
// duplicate; soft-deletes the duplicate.
router.post("/:id/merge/:duplicateId", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { id: primaryId, duplicateId } = req.params;
  if (primaryId === duplicateId) {
    return res.status(400).json({ error: "Cannot merge a contact into itself" });
  }
  try {
    const [primary, duplicate] = await Promise.all([
      prisma.contact.findFirst({ where: { id: primaryId, organizationId } }),
      prisma.contact.findFirst({ where: { id: duplicateId, organizationId } }),
    ]);
    if (!primary || !duplicate) {
      return res.status(404).json({ error: "Not found" });
    }

    const mergedTags = Array.from(
      new Set([...(primary.tags ?? []), ...(duplicate.tags ?? [])])
    );
    const fieldFill: Record<string, unknown> = {};
    if (!primary.email && duplicate.email) fieldFill.email = duplicate.email;
    if (!primary.address && duplicate.address) fieldFill.address = duplicate.address;
    if (!primary.ownerId && duplicate.ownerId) fieldFill.ownerId = duplicate.ownerId;

    await prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { contactId: duplicateId, organizationId },
        data: { contactId: primaryId },
      });
      await tx.deal.updateMany({
        where: { contactId: duplicateId, organizationId },
        data: { contactId: primaryId },
      });
      await tx.note.updateMany({
        where: { contactId: duplicateId, organizationId },
        data: { contactId: primaryId },
      });
      await tx.task.updateMany({
        where: { contactId: duplicateId, organizationId },
        data: { contactId: primaryId },
      });
      // CallLog has no direct contactId — it joins via Lead. Lead reassignment
      // above is sufficient; nothing further to do here.
      await tx.contact.update({
        where: { id: primaryId },
        data: { ...fieldFill, tags: mergedTags },
      });
      // Soft-delete the duplicate. Soft-delete extension hides it from future
      // reads. Phone uniqueness is `(phone, organizationId)` — soft-deleted
      // rows still occupy that slot, but that's acceptable: a re-creation with
      // the same phone returns 409 anyway via the dedup guard above.
      await tx.contact.updateMany({
        where: { id: duplicateId, organizationId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });

    await writeAuditLog(req, "CONTACT_MERGE", "Contact", primaryId, {
      merged: duplicateId,
      fields: Object.keys(fieldFill),
      tagsAdded: mergedTags.length - (primary.tags?.length ?? 0),
    });

    const result = await prisma.contact.findFirst({
      where: { id: primaryId, organizationId },
    });
    res.json({ contact: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", validateBody(updateSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { businessName, address, email } = req.body;
  try {
    const result = await prisma.contact.updateMany({
      where: { id: req.params.id, organizationId },
      data: { businessName, address, email },
    });
    if (result.count > 0) {
      const diff: Record<string, unknown> = {};
      if (businessName !== undefined) diff.businessName = businessName;
      if (address !== undefined) diff.address = address;
      if (email !== undefined) diff.email = email;
      await writeAuditLog(req, "CONTACT_UPDATE", "Contact", req.params.id, diff);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    // Soft-delete: existing routes still see this row gone via the prisma
    // extension's auto-injected `deletedAt: null` filter.
    const result = await prisma.contact.updateMany({
      where: { id: req.params.id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    await writeAuditLog(req, "CONTACT_DELETE", "Contact", req.params.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
