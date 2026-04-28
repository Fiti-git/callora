import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";

const router = express.Router();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  leadId: z.string().cuid().optional().nullable(),
  contactId: z.string().cuid().optional().nullable(),
});
const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
});

router.use(authenticate);

router.get("/", async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const { assignedToMe, completed, contactId, leadId } = req.query;
  try {
    const tasks = await prisma.task.findMany({
      where: {
        organizationId,
        ...(assignedToMe === "true" ? { assignedToId: userId } : {}),
        ...(completed !== undefined ? { completed: completed === "true" } : {}),
        ...(contactId ? { contactId: String(contactId) } : {}),
        ...(leadId ? { leadId: String(leadId) } : {}),
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { dueDate: "asc" },
    });
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", validateBody(createSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { title, description, dueDate, assignedToId, leadId, contactId } = req.body;
  try {
    const task = await prisma.task.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedToId: assignedToId ?? null,
        leadId: leadId ?? null,
        contactId: contactId ?? null,
        organizationId,
      },
    });
    res.status(201).json(task);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/complete", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    await prisma.task.updateMany({
      where: { id: req.params.id, organizationId },
      data: { completed: true, completedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", validateBody(updateSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { title, description, dueDate, assignedToId } = req.body;
  try {
    await prisma.task.updateMany({
      where: { id: req.params.id, organizationId },
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
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
    await prisma.task.deleteMany({ where: { id: req.params.id, organizationId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
