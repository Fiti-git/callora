import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaignCount = await prisma.campaign.count({
      where: { organizationId },
    });
    const leadCount = await prisma.lead.count({ where: { organizationId } });
    const qualifiedCount = await prisma.lead.count({
      where: { organizationId, status: "QUALIFIED" },
    });
    const callCount = await prisma.callLog.count({
      where: { lead: { organizationId } },
    });

    res.json({ campaignCount, leadCount, qualifiedCount, callCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
