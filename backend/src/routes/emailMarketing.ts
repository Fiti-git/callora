/**
 * Email Marketing routes (Phase 3 Agent 10).
 *
 *   /api/email-marketing/campaigns       — DRAFT → SCHEDULED → SENDING → SENT
 *   /api/email-marketing/lists           — recipient lists + members + CSV import
 *   /api/email-marketing/templates       — reusable HTML templates
 *   /api/email-marketing/automations     — trigger-based drip sequences
 *
 * All endpoints are tenant-authenticated and org-scoped.
 * Mutations write AuditLog rows.
 */
import express, { Request, Response } from "express";
import multer from "multer";
import { parse as parseCsv } from "fast-csv";
import { Readable } from "node:stream";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";
import { writeAuditLog } from "../lib/audit.js";
import { emailCampaignQueue, emailAutomationQueue } from "../lib/queue.js";
import { validateAutomationSequence } from "./emailMarketing/automationSchema.js";
import { renderMergeTags, buildMergeContext } from "../lib/mergeTags.js";
import { sendEmail } from "../lib/email.js";
import { orgRateLimit } from "../middleware/orgRateLimit.js";

// Per-org rate limit for the send-campaign endpoint. Three sends a minute
// per org is plenty for legit operators; anything higher is almost always a
// double-click or scripted retry.
const emailSendLimiter = orgRateLimit({
  name: "email-marketing-send",
  points: 3,
  duration: 60,
});

const router = express.Router();
router.use(authenticate);

// =====================================================================
// Helpers
// =====================================================================

const cursorPaging = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function pageQuery(req: Request) {
  return cursorPaging.parse({
    cursor: req.query.cursor,
    limit: req.query.limit ?? 50,
  });
}

function emailLower(s: string): string {
  return s.trim().toLowerCase();
}

// =====================================================================
// Campaigns
// =====================================================================

const campaignCreateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(998),
  previewText: z.string().max(500).nullish(),
  htmlBody: z.string().min(1),
  textBody: z.string().nullish(),
  fromName: z.string().min(1).max(200),
  fromEmail: z.string().email().max(320),
  replyTo: z.string().email().max(320).nullish(),
  listIds: z.array(z.string()).default([]),
});

const campaignUpdateSchema = campaignCreateSchema.partial();

router.post(
  "/campaigns",
  validateBody(campaignCreateSchema),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = (req as AuthRequest).user!;
    const body = req.body as z.infer<typeof campaignCreateSchema>;

    try {
      // Validate lists belong to org.
      if (body.listIds.length) {
        const lists = await prisma.emailRecipientList.findMany({
          where: { id: { in: body.listIds }, organizationId },
          select: { id: true },
        });
        if (lists.length !== body.listIds.length) {
          return res.status(400).json({ error: "invalid_list_ids" });
        }
      }

      const campaign = await prisma.emailCampaign.create({
        data: {
          organizationId,
          createdById: userId,
          name: body.name,
          subject: body.subject,
          previewText: body.previewText ?? null,
          htmlBody: body.htmlBody,
          textBody: body.textBody ?? null,
          fromName: body.fromName,
          fromEmail: body.fromEmail,
          replyTo: body.replyTo ?? null,
          recipientLists: body.listIds.length
            ? { create: body.listIds.map((listId) => ({ listId })) }
            : undefined,
        },
      });

      await writeAuditLog(req, "EMAIL_CAMPAIGN_CREATE", "EmailCampaign", campaign.id, {
        name: campaign.name,
      });
      res.status(201).json(campaign);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/campaigns", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const status = (req.query.status as string | undefined) || undefined;
  const { cursor, limit } = pageQuery(req);
  try {
    const items = await prisma.emailCampaign.findMany({
      where: { organizationId, ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    res.json({
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/campaigns/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, organizationId },
      include: { recipientLists: { include: { list: true } } },
    });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    res.json(campaign);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(
  "/campaigns/:id",
  validateBody(campaignUpdateSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const body = req.body as z.infer<typeof campaignUpdateSchema>;

    try {
      const existing = await prisma.emailCampaign.findFirst({
        where: { id: req.params.id, organizationId },
      });
      if (!existing) return res.status(404).json({ error: "not_found" });
      if (existing.status === "SENDING" || existing.status === "SENT") {
        return res
          .status(409)
          .json({ error: "campaign_locked", message: `Cannot edit a ${existing.status} campaign` });
      }
      const { listIds, ...rest } = body;
      const updated = await prisma.emailCampaign.update({
        where: { id: existing.id },
        data: {
          ...rest,
          ...(listIds !== undefined
            ? {
                recipientLists: {
                  deleteMany: {},
                  create: listIds.map((listId) => ({ listId })),
                },
              }
            : {}),
        },
      });
      await writeAuditLog(req, "EMAIL_CAMPAIGN_UPDATE", "EmailCampaign", updated.id, rest as any);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete("/campaigns/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const existing = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!existing) return res.status(404).json({ error: "not_found" });
    if (!(existing.status === "DRAFT" || existing.status === "SCHEDULED")) {
      return res
        .status(409)
        .json({ error: "delete_forbidden", message: `Cannot delete a ${existing.status} campaign` });
    }
    await prisma.emailCampaign.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(req, "EMAIL_CAMPAIGN_DELETE", "EmailCampaign", existing.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function snapshotRecipientCount(campaignId: string): Promise<number> {
  const lists = await prisma.emailCampaignList.findMany({
    where: { campaignId },
    select: { listId: true },
  });
  if (!lists.length) return 0;
  const result = await prisma.emailRecipientListMember.groupBy({
    by: ["email"],
    where: {
      listId: { in: lists.map((l) => l.listId) },
      unsubscribedAt: null,
    },
  });
  return result.length;
}

router.post("/campaigns/:id/send", emailSendLimiter, async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, organizationId },
      include: { recipientLists: true },
    });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (!(campaign.status === "DRAFT" || campaign.status === "SCHEDULED" || campaign.status === "PAUSED")) {
      return res.status(409).json({ error: "invalid_status", status: campaign.status });
    }
    if (!campaign.recipientLists.length) {
      return res.status(400).json({ error: "no_lists" });
    }
    const totalRecipients = await snapshotRecipientCount(campaign.id);
    if (!totalRecipients) {
      return res.status(400).json({ error: "no_recipients" });
    }

    const updated = await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: "SENDING", totalRecipients, sentAt: new Date() },
    });
    await emailCampaignQueue.add(
      "dispatch",
      { campaignId: campaign.id, organizationId },
      { jobId: `dispatch:${campaign.id}` }
    );
    await writeAuditLog(req, "EMAIL_CAMPAIGN_SEND", "EmailCampaign", campaign.id, {
      totalRecipients,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/campaigns/:id/schedule",
  validateBody(z.object({ scheduledAt: z.string().datetime() })),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const scheduledAt = new Date(req.body.scheduledAt);
    if (scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: "scheduled_at_in_past" });
    }
    try {
      const campaign = await prisma.emailCampaign.findFirst({
        where: { id: req.params.id, organizationId },
      });
      if (!campaign) return res.status(404).json({ error: "not_found" });
      if (!(campaign.status === "DRAFT" || campaign.status === "SCHEDULED")) {
        return res.status(409).json({ error: "invalid_status", status: campaign.status });
      }
      const updated = await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: "SCHEDULED", scheduledAt },
      });
      const delay = scheduledAt.getTime() - Date.now();
      await emailCampaignQueue.add(
        "dispatch",
        { campaignId: campaign.id, organizationId, scheduled: true },
        { jobId: `dispatch:${campaign.id}`, delay }
      );
      await writeAuditLog(req, "EMAIL_CAMPAIGN_SCHEDULE", "EmailCampaign", campaign.id, {
        scheduledAt: scheduledAt.toISOString(),
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.post("/campaigns/:id/pause", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "SENDING") {
      return res.status(409).json({ error: "invalid_status", status: campaign.status });
    }
    const updated = await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: "PAUSED" },
    });
    await writeAuditLog(req, "EMAIL_CAMPAIGN_PAUSE", "EmailCampaign", campaign.id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/campaigns/:id/resume", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "PAUSED") {
      return res.status(409).json({ error: "invalid_status", status: campaign.status });
    }
    const updated = await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: "SENDING" },
    });
    await emailCampaignQueue.add(
      "dispatch",
      { campaignId: campaign.id, organizationId, resumed: true },
      { jobId: `dispatch:${campaign.id}:resume:${Date.now()}` }
    );
    await writeAuditLog(req, "EMAIL_CAMPAIGN_RESUME", "EmailCampaign", campaign.id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/campaigns/:id/test-send",
  validateBody(z.object({ testRecipient: z.string().email() })),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const campaign = await prisma.emailCampaign.findFirst({
        where: { id: req.params.id, organizationId },
      });
      if (!campaign) return res.status(404).json({ error: "not_found" });
      const ctx = buildMergeContext({
        email: req.body.testRecipient,
        contact: { businessName: "Test Recipient", email: req.body.testRecipient },
      });
      const subject = `[TEST] ${renderMergeTags(campaign.subject, ctx)}`;
      const html = renderMergeTags(campaign.htmlBody, ctx);
      await sendEmail(req.body.testRecipient, subject, html, {
        organizationId,
        template: "campaign_test",
      });
      await writeAuditLog(req, "EMAIL_CAMPAIGN_TEST_SEND", "EmailCampaign", campaign.id, {
        testRecipient: req.body.testRecipient,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/campaigns/:id/analytics", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "not_found" });

    const sent = Math.max(campaign.totalSent, 1);
    const openRate = campaign.totalOpened / sent;
    const clickRate = campaign.totalClicked / sent;
    const bounceRate = campaign.totalBounced / sent;
    const unsubRate = campaign.totalUnsubscribed / sent;
    const complaintRate = campaign.totalComplained / sent;

    // 14-day daily-opens trend, bucketed by openedAt date.
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const opensRaw: Array<{ d: Date; c: bigint }> = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "openedAt") AS d, COUNT(*)::bigint AS c
      FROM "EmailSend"
      WHERE "campaignId" = ${campaign.id}
        AND "openedAt" IS NOT NULL
        AND "openedAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    const dailyOpensTrend = opensRaw.map((r) => ({
      date: r.d.toISOString().slice(0, 10),
      opens: Number(r.c),
    }));

    res.json({
      campaignId: campaign.id,
      totals: {
        recipients: campaign.totalRecipients,
        sent: campaign.totalSent,
        delivered: campaign.totalDelivered,
        opened: campaign.totalOpened,
        clicked: campaign.totalClicked,
        bounced: campaign.totalBounced,
        unsubscribed: campaign.totalUnsubscribed,
        complained: campaign.totalComplained,
      },
      openRate,
      clickRate,
      bounceRate,
      unsubRate,
      complaintRate,
      dailyOpensTrend,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/campaigns/:id/recipients", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const status = (req.query.status as string | undefined) || undefined;
  const { cursor, limit } = pageQuery(req);
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, organizationId },
      select: { id: true },
    });
    if (!campaign) return res.status(404).json({ error: "not_found" });

    const items = await prisma.emailSend.findMany({
      where: {
        campaignId: campaign.id,
        organizationId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        clickedAt: true,
        bouncedAt: true,
        unsubscribedAt: true,
        complainedAt: true,
        errorMessage: true,
      },
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    res.json({
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// Lists
// =====================================================================

const listCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
});

router.post(
  "/lists",
  validateBody(listCreateSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const list = await prisma.emailRecipientList.create({
        data: {
          organizationId,
          name: req.body.name,
          description: req.body.description ?? null,
        },
      });
      await writeAuditLog(req, "EMAIL_LIST_CREATE", "EmailRecipientList", list.id, {
        name: list.name,
      });
      res.status(201).json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/lists", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { cursor, limit } = pageQuery(req);
  try {
    const items = await prisma.emailRecipientList.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    res.json({ items: page, nextCursor: hasMore ? page[page.length - 1].id : null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/lists/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const list = await prisma.emailRecipientList.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!list) return res.status(404).json({ error: "not_found" });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(
  "/lists/:id",
  validateBody(listCreateSchema.partial()),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const result = await prisma.emailRecipientList.updateMany({
        where: { id: req.params.id, organizationId, deletedAt: null },
        data: req.body,
      });
      if (!result.count) return res.status(404).json({ error: "not_found" });
      await writeAuditLog(req, "EMAIL_LIST_UPDATE", "EmailRecipientList", req.params.id, req.body);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete("/lists/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const result = await prisma.emailRecipientList.updateMany({
      where: { id: req.params.id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) return res.status(404).json({ error: "not_found" });
    await writeAuditLog(req, "EMAIL_LIST_DELETE", "EmailRecipientList", req.params.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const addMembersSchema = z.union([
  z.object({ contactIds: z.array(z.string()).min(1) }),
  z.object({
    emails: z.array(z.string().email()).min(1),
  }),
]);

router.post(
  "/lists/:id/contacts",
  validateBody(addMembersSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const list = await prisma.emailRecipientList.findFirst({
        where: { id: req.params.id, organizationId },
      });
      if (!list) return res.status(404).json({ error: "not_found" });

      const body = req.body as z.infer<typeof addMembersSchema>;
      let inserted = 0;
      let skipped = 0;

      const upsertOne = async (
        email: string,
        contactId: string | null,
        source: "MANUAL" | "API" | "CSV_IMPORT" | "CAMPAIGN"
      ) => {
        try {
          const sup = await prisma.emailSuppression.findFirst({
            where: { email, OR: [{ organizationId }, { organizationId: null }] },
          });
          if (sup) {
            skipped++;
            return;
          }
          const r = await prisma.emailRecipientListMember.upsert({
            where: { listId_email: { listId: list.id, email } },
            update: {},
            create: { listId: list.id, email, contactId, source },
          });
          if (r) inserted++;
        } catch {
          skipped++;
        }
      };

      if ("contactIds" in body) {
        const contacts = await prisma.contact.findMany({
          where: { id: { in: body.contactIds }, organizationId, email: { not: null } },
          select: { id: true, email: true },
        });
        for (const c of contacts) {
          if (!c.email) continue;
          await upsertOne(emailLower(c.email), c.id, "MANUAL");
        }
        skipped += body.contactIds.length - contacts.length;
      } else {
        for (const e of body.emails) {
          await upsertOne(emailLower(e), null, "API");
        }
      }

      // Recompute denormalised count.
      const memberCount = await prisma.emailRecipientListMember.count({
        where: { listId: list.id, unsubscribedAt: null },
      });
      await prisma.emailRecipientList.update({
        where: { id: list.id },
        data: { memberCount },
      });
      await writeAuditLog(req, "EMAIL_LIST_ADD_MEMBERS", "EmailRecipientList", list.id, {
        inserted,
        skipped,
      });
      res.json({ inserted, skipped, memberCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/lists/:id/members", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { cursor, limit } = pageQuery(req);
  try {
    const list = await prisma.emailRecipientList.findFirst({
      where: { id: req.params.id, organizationId },
      select: { id: true },
    });
    if (!list) return res.status(404).json({ error: "not_found" });
    const items = await prisma.emailRecipientListMember.findMany({
      where: { listId: list.id },
      orderBy: { subscribedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        source: true,
        subscribedAt: true,
        unsubscribedAt: true,
      },
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    res.json({ items: page, nextCursor: hasMore ? page[page.length - 1].id : null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete(
  "/lists/:id/contacts/:memberId",
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const list = await prisma.emailRecipientList.findFirst({
        where: { id: req.params.id, organizationId },
      });
      if (!list) return res.status(404).json({ error: "not_found" });
      const result = await prisma.emailRecipientListMember.deleteMany({
        where: { id: req.params.memberId, listId: list.id },
      });
      if (!result.count) return res.status(404).json({ error: "not_found" });
      const memberCount = await prisma.emailRecipientListMember.count({
        where: { listId: list.id, unsubscribedAt: null },
      });
      await prisma.emailRecipientList.update({
        where: { id: list.id },
        data: { memberCount },
      });
      await writeAuditLog(req, "EMAIL_LIST_REMOVE_MEMBER", "EmailRecipientList", list.id, {
        memberId: req.params.memberId,
      });
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_CSV_ROWS = 10_000;

router.post(
  "/lists/:id/import",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    if (!req.file) return res.status(400).json({ error: "missing_file" });
    if (!/\.csv$/i.test(req.file.originalname || "")) {
      return res.status(400).json({ error: "invalid_file_type" });
    }
    try {
      const list = await prisma.emailRecipientList.findFirst({
        where: { id: req.params.id, organizationId },
      });
      if (!list) return res.status(404).json({ error: "not_found" });

      const rowSchema = z.object({
        email: z.string().email(),
        firstName: z.string().max(200).optional(),
        lastName: z.string().max(200).optional(),
        source: z.string().max(40).optional(),
      });

      const rows: Array<z.infer<typeof rowSchema>> = [];
      const errors: string[] = [];
      let rowIndex = 0;
      let aborted: { kind: string } | null = null;

      await new Promise<void>((resolve) => {
        const parser = parseCsv({ headers: true, ignoreEmpty: true, trim: true });
        parser.on("data", (row: Record<string, string>) => {
          rowIndex++;
          if (rowIndex > MAX_CSV_ROWS) {
            if (!aborted) {
              aborted = { kind: "CSV_ROW_LIMIT_EXCEEDED" };
              parser.end();
            }
            return;
          }
          const r = rowSchema.safeParse(row);
          if (!r.success) {
            errors.push(`row ${rowIndex}: ${r.error.issues[0].message}`);
            return;
          }
          rows.push(r.data);
        });
        parser.on("end", () => resolve());
        parser.on("error", (e) => {
          errors.push(`parser: ${e.message}`);
          resolve();
        });
        Readable.from(req.file!.buffer).pipe(parser);
      });

      if (aborted) return res.status(400).json({ error: "row_limit_exceeded", limit: MAX_CSV_ROWS });

      // Pre-load suppression in one query.
      const distinctEmails = Array.from(new Set(rows.map((r) => emailLower(r.email))));
      const suppressed = new Set(
        (
          await prisma.emailSuppression.findMany({
            where: {
              email: { in: distinctEmails },
              OR: [{ organizationId }, { organizationId: null }],
            },
            select: { email: true },
          })
        ).map((s) => s.email)
      );

      let inserted = 0;
      let skipped = 0;
      for (const r of rows) {
        const email = emailLower(r.email);
        if (suppressed.has(email)) {
          skipped++;
          continue;
        }
        try {
          await prisma.emailRecipientListMember.upsert({
            where: { listId_email: { listId: list.id, email } },
            update: {},
            create: { listId: list.id, email, source: "CSV_IMPORT" },
          });
          inserted++;
        } catch {
          skipped++;
        }
      }
      const memberCount = await prisma.emailRecipientListMember.count({
        where: { listId: list.id, unsubscribedAt: null },
      });
      await prisma.emailRecipientList.update({
        where: { id: list.id },
        data: { memberCount },
      });
      await writeAuditLog(req, "EMAIL_LIST_CSV_IMPORT", "EmailRecipientList", list.id, {
        inserted,
        skipped,
        errors: errors.length,
      });
      res.json({ inserted, skipped, errors });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================================
// Templates
// =====================================================================

const templateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().min(1),
  textBody: z.string().nullish(),
  category: z.string().max(80).nullish(),
  isDefault: z.boolean().optional(),
});

router.post(
  "/templates",
  validateBody(templateSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const t = await prisma.emailTemplate.create({
        data: { ...req.body, organizationId },
      });
      await writeAuditLog(req, "EMAIL_TEMPLATE_CREATE", "EmailTemplate", t.id, { name: t.name });
      res.status(201).json(t);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/templates", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const items = await prisma.emailTemplate.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(
  "/templates/:id",
  validateBody(templateSchema.partial()),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const result = await prisma.emailTemplate.updateMany({
        where: { id: req.params.id, organizationId, deletedAt: null },
        data: req.body,
      });
      if (!result.count) return res.status(404).json({ error: "not_found" });
      await writeAuditLog(req, "EMAIL_TEMPLATE_UPDATE", "EmailTemplate", req.params.id, req.body);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete("/templates/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const result = await prisma.emailTemplate.updateMany({
      where: { id: req.params.id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) return res.status(404).json({ error: "not_found" });
    await writeAuditLog(req, "EMAIL_TEMPLATE_DELETE", "EmailTemplate", req.params.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// Automations
// =====================================================================

const automationSchema = z.object({
  name: z.string().min(1).max(200),
  trigger: z.enum(["LEAD_QUALIFIED", "DEAL_WON", "CONTACT_CREATED", "CAMPAIGN_COMPLETE"]),
  active: z.boolean().optional(),
  sequence: z.array(z.any()).min(1),
});

router.post(
  "/automations",
  validateBody(automationSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const issue = validateAutomationSequence(req.body.sequence);
    if (issue) return res.status(400).json({ error: "invalid_sequence", message: issue });
    try {
      const a = await prisma.emailAutomation.create({
        data: {
          organizationId,
          name: req.body.name,
          trigger: req.body.trigger,
          active: req.body.active ?? false,
          sequence: req.body.sequence,
        },
      });
      await writeAuditLog(req, "EMAIL_AUTOMATION_CREATE", "EmailAutomation", a.id, {
        trigger: a.trigger,
      });
      res.status(201).json(a);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/automations", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const items = await prisma.emailAutomation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(
  "/automations/:id",
  validateBody(automationSchema.partial()),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    if (req.body.sequence !== undefined) {
      const issue = validateAutomationSequence(req.body.sequence);
      if (issue) return res.status(400).json({ error: "invalid_sequence", message: issue });
    }
    try {
      const result = await prisma.emailAutomation.updateMany({
        where: { id: req.params.id, organizationId, deletedAt: null },
        data: req.body,
      });
      if (!result.count) return res.status(404).json({ error: "not_found" });
      await writeAuditLog(req, "EMAIL_AUTOMATION_UPDATE", "EmailAutomation", req.params.id, req.body);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.patch(
  "/automations/:id/activate",
  validateBody(z.object({ active: z.boolean() })),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    try {
      const result = await prisma.emailAutomation.updateMany({
        where: { id: req.params.id, organizationId, deletedAt: null },
        data: { active: req.body.active },
      });
      if (!result.count) return res.status(404).json({ error: "not_found" });
      await writeAuditLog(req, "EMAIL_AUTOMATION_TOGGLE", "EmailAutomation", req.params.id, {
        active: req.body.active,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================================
// Trigger helper — used by leads/deals/contacts routes + campaign worker.
// =====================================================================

export async function enqueueAutomationRun(
  organizationId: string,
  trigger: "LEAD_QUALIFIED" | "DEAL_WON" | "CONTACT_CREATED" | "CAMPAIGN_COMPLETE",
  ctx: { contactId?: string | null; email?: string | null; data?: Record<string, unknown> }
): Promise<void> {
  const automations = await prisma.emailAutomation.findMany({
    where: { organizationId, trigger, active: true, deletedAt: null },
  });
  for (const a of automations) {
    const run = await prisma.emailAutomationRun.create({
      data: {
        organizationId,
        automationId: a.id,
        contactId: ctx.contactId ?? null,
        currentStep: 0,
        status: "RUNNING",
        context: {
          email: ctx.email ?? null,
          contactId: ctx.contactId ?? null,
          ...(ctx.data ?? {}),
        },
      },
    });
    await emailAutomationQueue.add(
      "tick",
      { runId: run.id },
      { jobId: `tick:${run.id}` }
    );
  }
}

export default router;
