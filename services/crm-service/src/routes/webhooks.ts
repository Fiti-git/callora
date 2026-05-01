/**
 * Tenant webhook management routes — ported from backend/src/routes/webhooks.ts.
 *
 * Mounted at /api/webhooks (tenant ADMIN only):
 *   POST   /                                — create (returns secret ONCE)
 *   GET    /                                — list (no secret)
 *   GET    /:id                             — detail (no secret)
 *   POST   /:id/regenerate-secret           — rotate (returns new secret ONCE)
 *   DELETE /:id                             — soft-delete
 *   GET    /:id/deliveries                  — paginated delivery history
 *   POST   /:id/deliveries/:deliveryId/redeliver
 *   POST   /:id/test                        — synthetic test.ping
 *
 * Zapier glue (no tenant JWT — auth via Organization.zapierTriggerToken):
 *   GET    /zapier/trigger-url              — auth required, returns subscribe URL
 *   POST   /zapier/subscribe?token=&url=&event=
 *   DELETE /zapier/unsubscribe?token=&webhookId=
 */
import express, { Request, Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@callora/shared";
import { authenticate, AuthRequest, requireRole } from "../middleware/requireAuth.js";
import { validateBody } from "../lib/validate.js";
import { writeAuditLog } from "../lib/audit.js";
import { tenantWebhookQueue } from "../lib/queue.js";

const router = express.Router();

const WEBHOOK_EVENTS = [
  "LEAD_QUALIFIED",
  "CALL_COMPLETED",
  "DEAL_WON",
  "CAMPAIGN_COMPLETED",
  "EMAIL_OPENED",
  "EMAIL_CLICKED",
] as const;

function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}
function generateZapierToken(): string {
  return `zap_${crypto.randomBytes(24).toString("hex")}`;
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (process.env.NODE_ENV === "development") {
      return u.protocol === "http:" || u.protocol === "https:";
    }
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

const updateSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  active: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Zapier integration — must be defined BEFORE the `:id` routes since the
// path segment "zapier" would otherwise be interpreted as a webhook id.
// ---------------------------------------------------------------------------

router.get(
  "/zapier/trigger-url",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { zapierTriggerToken: true },
    });
    let token = org?.zapierTriggerToken;
    if (!token) {
      token = generateZapierToken();
      await prisma.organization.update({
        where: { id: organizationId },
        data: { zapierTriggerToken: token },
      });
    }
    const base = process.env.PUBLIC_API_URL || "http://localhost:4000";
    res.json({
      subscribeUrl: `${base}/api/webhooks/zapier/subscribe?token=${token}`,
      unsubscribeUrl: `${base}/api/webhooks/zapier/unsubscribe?token=${token}`,
      events: WEBHOOK_EVENTS,
      docs: "POST subscribeUrl with `url` and `event` (comma-separated WebhookEvent values).",
    });
  }
);

router.post("/zapier/subscribe", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  const url = String(req.query.url ?? req.body?.url ?? "");
  const event = String(req.query.event ?? req.body?.event ?? "");
  if (!token || !url || !event) {
    return res.status(400).json({ error: "missing token/url/event" });
  }
  const org = await prisma.organization.findFirst({
    where: { zapierTriggerToken: token },
    select: { id: true },
  });
  if (!org) return res.status(401).json({ error: "invalid_token" });
  if (!isValidUrl(url)) return res.status(400).json({ error: "invalid_url" });
  const events = event
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is (typeof WEBHOOK_EVENTS)[number] =>
      (WEBHOOK_EVENTS as readonly string[]).includes(s)
    );
  if (events.length === 0) {
    return res.status(400).json({ error: "no valid events", allowed: WEBHOOK_EVENTS });
  }
  const secret = generateSecret();
  const wh = await prisma.tenantWebhook.create({
    data: {
      organizationId: org.id,
      url,
      events: events as any,
      secret,
      active: true,
    },
    select: { id: true },
  });
  res.status(201).json({ id: wh.id, secret });
});

router.delete("/zapier/unsubscribe", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  const webhookId = String(req.query.webhookId ?? req.body?.webhookId ?? "");
  if (!token || !webhookId) return res.status(400).json({ error: "missing token/webhookId" });
  const org = await prisma.organization.findFirst({
    where: { zapierTriggerToken: token },
    select: { id: true },
  });
  if (!org) return res.status(401).json({ error: "invalid_token" });
  const result = await prisma.tenantWebhook.updateMany({
    where: { id: webhookId, organizationId: org.id, deletedAt: null },
    data: { deletedAt: new Date(), active: false },
  });
  if (result.count === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Tenant-managed webhooks — auth required for all routes below.
// ---------------------------------------------------------------------------
router.use(authenticate);

router.post(
  "/",
  requireRole("ADMIN"),
  validateBody(createSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const { url, events } = req.body as { url: string; events: string[] };
    if (!isValidUrl(url)) {
      return res.status(400).json({
        error: "invalid_url",
        message:
          process.env.NODE_ENV === "development"
            ? "URL must be http(s)"
            : "URL must be https",
      });
    }
    const secret = generateSecret();
    const wh = await prisma.tenantWebhook.create({
      data: {
        organizationId,
        url,
        events: events as any,
        secret,
        active: true,
      },
    });
    await writeAuditLog(req, "WEBHOOK_CREATE", "TenantWebhook", wh.id, {
      url,
      events,
    });
    // Returns secret ONCE.
    res.status(201).json({
      id: wh.id,
      url: wh.url,
      events: wh.events,
      active: wh.active,
      secret,
      createdAt: wh.createdAt,
    });
  }
);

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const rows = await prisma.tenantWebhook.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      events: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(rows);
});

router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const row = await prisma.tenantWebhook.findFirst({
    where: { id: req.params.id, organizationId },
    select: {
      id: true,
      url: true,
      events: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(row);
});

router.patch(
  "/:id",
  requireRole("ADMIN"),
  validateBody(updateSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const { url, events, active } = req.body as {
      url?: string;
      events?: string[];
      active?: boolean;
    };
    if (url !== undefined && !isValidUrl(url)) {
      return res.status(400).json({ error: "invalid_url" });
    }
    const result = await prisma.tenantWebhook.updateMany({
      where: { id: req.params.id, organizationId, deletedAt: null },
      data: {
        ...(url !== undefined ? { url } : {}),
        ...(events !== undefined ? { events: events as any } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    });
    if (result.count === 0) return res.status(404).json({ error: "not_found" });
    await writeAuditLog(req, "WEBHOOK_UPDATE", "TenantWebhook", req.params.id, {
      url,
      events,
      active,
    });
    res.json({ ok: true });
  }
);

router.post(
  "/:id/regenerate-secret",
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const wh = await prisma.tenantWebhook.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!wh) return res.status(404).json({ error: "not_found" });
    const secret = generateSecret();
    await prisma.tenantWebhook.update({
      where: { id: wh.id },
      data: { secret },
    });
    await writeAuditLog(req, "WEBHOOK_ROTATE_SECRET", "TenantWebhook", wh.id);
    res.json({ secret });
  }
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const result = await prisma.tenantWebhook.updateMany({
      where: { id: req.params.id, organizationId, deletedAt: null },
      data: { deletedAt: new Date(), active: false },
    });
    if (result.count === 0) return res.status(404).json({ error: "not_found" });
    await writeAuditLog(req, "WEBHOOK_DELETE", "TenantWebhook", req.params.id);
    res.status(204).end();
  }
);

router.get("/:id/deliveries", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const wh = await prisma.tenantWebhook.findFirst({
    where: { id: req.params.id, organizationId },
    select: { id: true },
  });
  if (!wh) return res.status(404).json({ error: "not_found" });
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor ? String(req.query.cursor) : null;
  const rows = await prisma.webhookDelivery.findMany({
    where: { webhookId: wh.id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  res.json({
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  });
});

router.post(
  "/:id/deliveries/:deliveryId/redeliver",
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const wh = await prisma.tenantWebhook.findFirst({
      where: { id: req.params.id, organizationId },
      select: { id: true },
    });
    if (!wh) return res.status(404).json({ error: "not_found" });
    const old = await prisma.webhookDelivery.findFirst({
      where: { id: req.params.deliveryId, webhookId: wh.id },
    });
    if (!old) return res.status(404).json({ error: "delivery_not_found" });

    const fresh = await prisma.webhookDelivery.create({
      data: {
        webhookId: wh.id,
        organizationId,
        event: old.event,
        payload: old.payload as any,
        status: "PENDING",
      },
    });
    await tenantWebhookQueue.add(
      "deliver",
      { deliveryId: fresh.id },
      { jobId: `delivery:${fresh.id}` }
    );
    await writeAuditLog(req, "WEBHOOK_REDELIVER", "WebhookDelivery", fresh.id, {
      sourceDeliveryId: old.id,
    });
    res.status(202).json({ id: fresh.id });
  }
);

router.post(
  "/:id/test",
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const wh = await prisma.tenantWebhook.findFirst({
      where: { id: req.params.id, organizationId, deletedAt: null },
    });
    if (!wh) return res.status(404).json({ error: "not_found" });
    const fresh = await prisma.webhookDelivery.create({
      data: {
        webhookId: wh.id,
        organizationId,
        event: (wh.events[0] ?? "LEAD_QUALIFIED") as any,
        payload: {
          event: "test.ping",
          message: "This is a synthetic Callora webhook test event.",
          emittedAt: new Date().toISOString(),
        } as any,
        status: "PENDING",
      },
    });
    await tenantWebhookQueue.add(
      "deliver",
      { deliveryId: fresh.id },
      { jobId: `delivery:${fresh.id}` }
    );
    await writeAuditLog(req, "WEBHOOK_TEST", "TenantWebhook", wh.id);
    res.status(202).json({ deliveryId: fresh.id });
  }
);

export default router;
