import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import {
  authenticatePlatform,
  PlatformAuthRequest,
} from "../../middleware/platformAuth.js";
import { writeAudit } from "../../lib/audit.js";

const router = express.Router();

router.use(authenticatePlatform);

router.get("/", async (_req: Request, res: Response) => {
  const orgs = await prisma.organization.findMany({
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { users: true, campaigns: true, leads: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(orgs);
});

router.get("/:id", async (req: Request, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: {
      subscription: { include: { plan: true } },
      users: {
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      },
      usage: { orderBy: { periodStart: "desc" }, take: 12 },
      _count: { select: { campaigns: true, leads: true, contacts: true } },
    },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json(org);
});

const statusSchema = z.object({
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"]),
  reason: z.string().optional(),
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid status" });

  const org = await prisma.organization.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });

  const actor = (req as PlatformAuthRequest).platformUser!;
  await writeAudit({
    actorType: "PLATFORM",
    actorId: actor.id,
    organizationId: org.id,
    action: "org.status.change",
    target: org.id,
    metadata: { to: parsed.data.status, reason: parsed.data.reason },
  });

  res.json(org);
});

const planChangeSchema = z.object({
  planId: z.string().min(1),
});

router.patch("/:id/plan", async (req: Request, res: Response) => {
  const parsed = planChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const sub = await prisma.subscription.upsert({
    where: { organizationId: req.params.id },
    update: { planId: plan.id },
    create: {
      organizationId: req.params.id,
      planId: plan.id,
      status: "ACTIVE",
    },
    include: { plan: true },
  });

  const actor = (req as PlatformAuthRequest).platformUser!;
  await writeAudit({
    actorType: "PLATFORM",
    actorId: actor.id,
    organizationId: req.params.id,
    action: "org.plan.change",
    target: req.params.id,
    metadata: { planTier: plan.tier },
  });

  res.json(sub);
});

router.get("/:id/audit", async (req: Request, res: Response) => {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

export default router;
