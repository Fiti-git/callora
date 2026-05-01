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

const KIND_FIELD: Record<
  string,
  "callsMade" | "placesScraped" | "aiTokens" | "emailsSent"
> = {
  VAPI_CALL: "callsMade",
  PLACES: "placesScraped",
  GEMINI_TOKEN: "aiTokens",
  EMAIL: "emailsSent",
};

const bodySchema = z.object({
  kind: z.enum(["VAPI_CALL", "PLACES", "GEMINI_TOKEN", "EMAIL"]),
  units: z.number().int().min(1).max(1_000_000),
  reason: z.string().min(1).max(500),
});

/**
 * POST /api/platform/quota-credit/:orgId
 *
 * Manually credits an org's current-period UsageRecord by *decrementing* the
 * matching counter. Counter is clamped at 0. Always writes AuditLog.
 */
router.post("/:orgId", async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid input", issues: parsed.error.issues });
  }
  const { kind, units, reason } = parsed.data;
  const platformUser = (req as PlatformAuthRequest).platformUser!;
  const { orgId } = req.params;

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const existing = await prisma.usageRecord.upsert({
    where: {
      organizationId_periodStart: { organizationId: orgId, periodStart },
    },
    update: {},
    create: { organizationId: orgId, periodStart, periodEnd },
  });

  const field = KIND_FIELD[kind];
  const before = (existing as Record<string, unknown>)[field] as number;
  const after = Math.max(0, before - units);
  const applied = before - after;

  const updated = await prisma.usageRecord.update({
    where: {
      organizationId_periodStart: { organizationId: orgId, periodStart },
    },
    data: { [field]: after },
  });

  await writeAudit({
    actorType: "PLATFORM",
    actorId: platformUser.id,
    organizationId: orgId,
    action: "QUOTA_CREDIT",
    target: orgId,
    metadata: { kind, units, applied, before, after, reason },
  });

  res.json({ ok: true, kind, before, after, applied, usage: updated });
});

export default router;
