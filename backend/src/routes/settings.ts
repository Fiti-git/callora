import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth.js";
import {
  validateGoogleMapsKey,
  validateGeminiKey,
  validateVapiKey,
} from "../lib/validateApiKeys.js";

const router = express.Router();

router.use(authenticate);

// GET /api/settings/ai-caller
router.get("/ai-caller", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        aiCallerName: true,
        aiCallerCompany: true,
        aiCallerPhone: true,
        aiSystemPrompt: true,
      },
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json(org);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const aiCallerSchema = z.object({
  aiCallerName: z.string().trim().min(1, "Caller name is required").max(50),
  aiCallerCompany: z.string().trim().min(1, "Company name is required").max(100),
  aiCallerPhone: z.string().trim().max(40).optional().default(""),
  aiSystemPrompt: z.string().trim().max(2000).optional().nullable(),
});

// PATCH /api/settings/ai-caller
router.patch("/ai-caller", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;

  const parsed = aiCallerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { aiCallerName, aiCallerCompany, aiCallerPhone, aiSystemPrompt } = parsed.data;

  try {
    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        aiCallerName,
        aiCallerCompany,
        aiCallerPhone: aiCallerPhone ?? "",
        aiSystemPrompt:
          aiSystemPrompt && aiSystemPrompt.length > 0 ? aiSystemPrompt : null,
      },
      select: {
        aiCallerName: true,
        aiCallerCompany: true,
        aiCallerPhone: true,
        aiSystemPrompt: true,
      },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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

    const [googleResult, geminiResult, vapiResult] = await Promise.all([
      data.googleMapsKey ? validateGoogleMapsKey(data.googleMapsKey) : null,
      data.geminiKey ? validateGeminiKey(data.geminiKey) : null,
      data.vapiKey ? validateVapiKey(data.vapiKey) : null,
    ]);

    res.json({
      success: true,
      keys,
      validation: {
        googleMaps: googleResult,
        gemini: geminiResult,
        vapi: vapiResult,
      },
    });
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
