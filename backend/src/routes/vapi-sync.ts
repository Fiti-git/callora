import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

// POST /api/vapi/sync — stub for syncing Vapi call history
router.post("/sync", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    // Returns placeholder until full Vapi history sync is implemented
    res.json({ imported: 0, skipped: 0, total: 0, errors: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
