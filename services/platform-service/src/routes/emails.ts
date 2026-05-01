import express, { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@callora/shared";
import {
  authenticatePlatform,
  PlatformAuthRequest,
} from "../middleware/platformAuth.js";
import { writeAudit } from "../lib/audit.js";

const router = express.Router();
router.use(authenticatePlatform);

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:4008";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

function internalHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (INTERNAL_TOKEN) h["x-internal-token"] = INTERNAL_TOKEN;
  return h;
}

const querySchema = z.object({
  organizationId: z.string().min(1).optional(),
  recipient: z.string().min(1).optional(),
  status: z.enum(["SENT", "FAILED", "QUOTA_EXCEEDED"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().min(1).optional(),
});

/**
 * GET /api/platform/emails
 * Paginated EmailLog reader.
 */
router.get("/", async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", issues: parsed.error.issues });
  }
  const { organizationId, recipient, status, limit = 50, cursor } = parsed.data;

  const where: Record<string, unknown> = {
    ...(organizationId ? { organizationId } : {}),
    ...(recipient
      ? { recipient: { contains: recipient, mode: "insensitive" } }
      : {}),
    ...(status ? { status } : {}),
  };

  const items = await prisma.emailLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;

  res.json({
    items: trimmed,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
  });
});

const sendSchema = z.object({
  template: z.string().min(1).max(64),
  to: z.string().email(),
  data: z.record(z.string(), z.unknown()).optional(),
  organizationId: z.string().min(1).optional(),
});

/**
 * POST /api/platform/emails/send
 *
 * Admin-triggered email send. Proxies to notification-service
 * /internal/send-email and writes an AuditLog row regardless of outcome.
 */
router.post("/send", async (req: Request, res: Response) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid input", issues: parsed.error.issues });
  }
  const platformUser = (req as PlatformAuthRequest).platformUser!;
  const { template, to, data, organizationId } = parsed.data;

  let upstream: { ok: boolean; status: number; body: unknown };
  try {
    const r = await fetch(`${NOTIFICATION_SERVICE_URL}/internal/send-email`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        template,
        to,
        data: data ?? {},
        organizationId,
        // Admin-initiated sends should fail loudly on quota issues so the
        // operator knows what happened.
        required: true,
      }),
    });
    upstream = { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  } catch (err: any) {
    upstream = {
      ok: false,
      status: 502,
      body: { error: err?.message ?? "notification-service unreachable" },
    };
  }

  await writeAudit({
    actorType: "PLATFORM",
    actorId: platformUser.id,
    organizationId: organizationId ?? null,
    action: "EMAIL_SEND",
    target: to,
    metadata: {
      template,
      organizationId: organizationId ?? null,
      upstreamStatus: upstream.status,
      ok: upstream.ok,
    },
  });

  res.status(upstream.ok ? 200 : upstream.status).json(upstream.body);
});

export default router;
