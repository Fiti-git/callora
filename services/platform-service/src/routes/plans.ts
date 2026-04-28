import express, { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@callora/shared";
import {
  authenticatePlatform,
  requireSuperAdmin,
} from "../middleware/platformAuth.js";

const router = express.Router();

router.use(authenticatePlatform);

router.get("/", async (_req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { priceCents: "asc" } });
  res.json(plans);
});

const upsertSchema = z.object({
  tier: z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]),
  name: z.string().min(1),
  stripePriceId: z.string().min(1),
  monthlyCallQuota: z.number().int().min(0),
  monthlyLeadQuota: z.number().int().min(0),
  seatLimit: z.number().int().min(1),
  priceCents: z.number().int().min(0),
});

router.put("/:tier", requireSuperAdmin, async (req: Request, res: Response) => {
  const parsed = upsertSchema.safeParse({ ...req.body, tier: req.params.tier });
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const plan = await prisma.plan.upsert({
    where: { tier: parsed.data.tier },
    update: parsed.data,
    create: parsed.data,
  });
  res.json(plan);
});

export default router;
