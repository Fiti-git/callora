import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";

const router = express.Router();

const createSchema = z.object({
  phoneNumber: z.string().min(7).max(40),
  reason: z.string().max(500).optional().nullable(),
});

router.use(authenticate);

// GET /blacklist
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const list = await prisma.blacklist.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /blacklist
router.post("/", validateBody(createSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { phoneNumber, reason } = req.body;

  try {
    const existing = await prisma.blacklist.findFirst({
      where: { organizationId, phoneNumber },
    });
    if (existing) return res.status(400).json({ error: "Number already blacklisted" });

    const entry = await prisma.blacklist.create({
      data: { phoneNumber, reason: reason || null, organizationId },
    });
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /blacklist/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const entry = await prisma.blacklist.findUnique({ where: { id: req.params.id } });
    if (!entry || entry.organizationId !== organizationId)
      return res.status(404).json({ error: "Not found" });

    await prisma.blacklist.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
