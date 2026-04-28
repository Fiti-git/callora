import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";

const router = express.Router();

const createSchema = z.object({
  content: z.string().min(1).max(5000),
  type: z.enum(["NOTE", "CALL", "EMAIL", "STATUS_CHANGE"]).optional(),
  leadId: z.string().cuid().optional().nullable(),
  contactId: z.string().cuid().optional().nullable(),
});
const updateSchema = z.object({ content: z.string().min(1).max(5000) });

router.use(authenticate);

router.get("/", async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const { leadId, contactId } = req.query;
  try {
    const notes = await prisma.note.findMany({
      where: {
        organizationId,
        ...(leadId ? { leadId: String(leadId) } : {}),
        ...(contactId ? { contactId: String(contactId) } : {}),
      },
      include: { author: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(notes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", validateBody(createSchema), async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const { content, type, leadId, contactId } = req.body;
  try {
    const note = await prisma.note.create({
      data: {
        content,
        type: type ?? "NOTE",
        authorId: userId,
        organizationId,
        leadId: leadId ?? null,
        contactId: contactId ?? null,
      },
    });
    res.status(201).json(note);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", validateBody(updateSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { content } = req.body;
  try {
    const note = await prisma.note.updateMany({
      where: { id: req.params.id, organizationId },
      data: { content },
    });
    res.json(note);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    await prisma.note.deleteMany({ where: { id: req.params.id, organizationId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
