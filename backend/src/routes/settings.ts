import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

// GET API KEYS
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;

  const keys = await prisma.apiKey.findUnique({
    where: { organizationId },
  });

  res.json(keys || {});
});

// UPDATE API KEYS
router.post("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const data = req.body;

  try {
    // Check if exists
    const existing = await prisma.apiKey.findUnique({
      where: { organizationId },
    });

    let keys;
    if (existing) {
      keys = await prisma.apiKey.update({ where: { organizationId }, data });
    } else {
      keys = await prisma.apiKey.create({
        data: { ...data, organizationId },
      });
    }

    res.json({ success: true, keys });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
