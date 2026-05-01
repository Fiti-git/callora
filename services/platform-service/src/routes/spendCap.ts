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

// GET /api/platform/spend-cap/:orgId
router.get("/:orgId", async (req: Request, res: Response) => {
  const { orgId } = req.params;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const cap = await prisma.spendCap.findUnique({
    where: { organizationId: orgId },
  });
  res.json({ organization: org, spendCap: cap });
});

// PATCH /api/platform/spend-cap/:orgId
const patchSchema = z
  .object({
    dailyCapCents: z.number().int().min(0).optional(),
    monthlyCapCents: z.number().int().min(0).optional(),
  })
  .refine((d) => d.dailyCapCents !== undefined || d.monthlyCapCents !== undefined, {
    message: "At least one of dailyCapCents or monthlyCapCents required",
  });

router.patch("/:orgId", async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }
  const { orgId } = req.params;

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const now = new Date();
  const updated = await prisma.spendCap.upsert({
    where: { organizationId: orgId },
    update: {
      ...(parsed.data.dailyCapCents !== undefined
        ? { dailyCapCents: parsed.data.dailyCapCents }
        : {}),
      ...(parsed.data.monthlyCapCents !== undefined
        ? { monthlyCapCents: parsed.data.monthlyCapCents }
        : {}),
    },
    create: {
      organizationId: orgId,
      dailyCapCents: parsed.data.dailyCapCents ?? 0,
      monthlyCapCents: parsed.data.monthlyCapCents ?? 0,
      lastDayResetAt: now,
      lastMonthResetAt: now,
    },
  });

  const actor = (req as PlatformAuthRequest).platformUser!;
  await writeAudit({
    actorType: "PLATFORM",
    actorId: actor.id,
    organizationId: orgId,
    action: "spend_cap_updated",
    target: orgId,
    metadata: parsed.data as Record<string, unknown>,
  });

  res.json(updated);
});

export default router;
