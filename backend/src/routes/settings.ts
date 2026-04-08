import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth.js";

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

// GET /api/settings/team — list org users with roles
router.get("/team", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;

  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  res.json(users);
});

// PATCH /api/settings/team/:userId/role — ADMIN only
router.patch("/team/:userId/role", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const { organizationId, userId: requesterId } = (req as AuthRequest).user!;
  const { role } = req.body;

  if (!["ADMIN", "MEMBER", "VIEWER"].includes(role)) {
    return res.status(400).json({ error: "Invalid role. Must be ADMIN, MEMBER, or VIEWER" });
  }

  const target = await prisma.user.findFirst({
    where: { id: req.params.userId, organizationId },
  });
  if (!target) return res.status(404).json({ error: "User not found" });

  // Prevent last admin from being demoted
  if (target.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { organizationId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Cannot demote the last admin" });
    }
  }

  const updated = await prisma.user.update({
    where: { id: req.params.userId },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  res.json(updated);
});

export default router;
