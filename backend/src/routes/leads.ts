import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

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

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { campaign: true, calls: true },
    });
    res.json(leads);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /leads/:id/schedule-followup — manually schedule a follow-up for any lead
router.patch("/:id/schedule-followup", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { type, scheduledAt } = req.body as {
    type: "PENDING_RETRY" | "PENDING_FOLLOWUP";
    scheduledAt: string; // ISO date string
  };

  if (!type || !scheduledAt) {
    return res.status(400).json({ error: "type and scheduledAt are required" });
  }
  if (type !== "PENDING_RETRY" && type !== "PENDING_FOLLOWUP") {
    return res.status(400).json({ error: "type must be PENDING_RETRY or PENDING_FOLLOWUP" });
  }

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id, organizationId },
    });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const date = new Date(scheduledAt);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: "Invalid scheduledAt date" });
    }

    const updated = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        status: type,
        nextCallAt: type === "PENDING_RETRY" ? date : null,
        followUpAt: type === "PENDING_FOLLOWUP" ? date : null,
      },
      include: { campaign: true },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
