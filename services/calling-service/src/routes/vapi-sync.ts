import express, { Request, Response } from "express";
import { prisma } from "@callora/shared";
import { AuthRequest } from "../middleware/requireAuth.js";

const router = express.Router();

// GET /api/vapi/sync — manual reconciliation entry (auth applied at mount)
router.get("/sync", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    // Returns placeholder until full Vapi history sync is implemented
    res.json({ imported: 0, skipped: 0, total: 0, errors: [], organizationId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vapi/sync — same handler, supports both verbs
router.post("/sync", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    res.json({ imported: 0, skipped: 0, total: 0, errors: [], organizationId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
