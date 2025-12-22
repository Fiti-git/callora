import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

// GET /leads
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;

  try {
    const leads = await prisma.lead.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { campaign: true, calls: true },
    });
    res.json(leads);
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
