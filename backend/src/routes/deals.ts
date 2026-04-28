import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";

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

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { contactId, stage } = req.query;
  try {
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
  const { organizationId } = (req as AuthRequest).user!;
  const { title, contactId, value, probability, stage, closeDate, notes, assignedToId } = req.body;
  try {
    const deal = await prisma.deal.create({
      data: {
        title,
        contactId,
        value,
        probability,
        stage: stage ?? "PROSPECT",
        closeDate: closeDate ? new Date(closeDate) : null,
        notes,
        assignedToId: assignedToId ?? null,
        organizationId,
      },
    });
    res.status(201).json(deal);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", validateBody(updateSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { title, value, probability, stage, closeDate, notes, assignedToId } = req.body;
  try {
    await prisma.deal.updateMany({
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
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    await prisma.deal.deleteMany({ where: { id: req.params.id, organizationId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
