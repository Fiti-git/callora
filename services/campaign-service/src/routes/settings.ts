import express, { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@callora/shared";
import { authenticate, requireRole, AuthRequest } from "../middleware/requireAuth.js";

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

// GET /api/settings — returns onboarding fields + aiCaller config.
// NOTE: As of the compact-platform migration (2026-05-01), tenant-scoped
// 3rd-party API keys (Google Maps, Gemini, Vapi) are no longer stored per-org;
// the platform manages those credentials centrally. The legacy `ApiKey` model
// has been removed from the schema.
router.get("/", async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;

  try {
    const [org, user] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          onboardingStep: true,
          aiCallerName: true,
          aiCallerCompany: true,
          aiCallerPhone: true,
          aiSystemPrompt: true,
          vapiPhoneNumber: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { emailVerified: true },
      }),
    ]);

    res.json({
      onboardingStep: org?.onboardingStep ?? "verify_email",
      emailVerified: user?.emailVerified ?? false,
      aiCallerName: org?.aiCallerName ?? null,
      aiCallerCompany: org?.aiCallerCompany ?? null,
      aiCallerPhone: org?.aiCallerPhone ?? null,
      aiSystemPrompt: org?.aiSystemPrompt ?? null,
      vapiPhoneNumber: org?.vapiPhoneNumber ?? null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings — DEPRECATED. Tenant-scoped API keys are no longer
// supported under the compact-platform model. Returns 410 Gone so legacy
// frontends fail loudly rather than silently dropping submitted credentials.
router.post("/", async (_req: Request, res: Response) => {
  res.status(410).json({
    error: "TENANT_API_KEYS_REMOVED",
    message:
      "Tenant-supplied API keys (Google Maps, Gemini, Vapi) are no longer accepted. The platform now manages these credentials centrally.",
  });
});

// PATCH /api/settings — update onboarding step, aiCaller config, or both
router.patch("/", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const {
    onboardingStep,
    aiCallerName,
    aiCallerCompany,
    aiCallerPhone,
    aiSystemPrompt,
  } = req.body as {
    onboardingStep?: string;
    aiCallerName?: string;
    aiCallerCompany?: string;
    aiCallerPhone?: string;
    aiSystemPrompt?: string | null;
  };

  try {
    const orgUpdate: Record<string, unknown> = {};
    if (onboardingStep !== undefined) orgUpdate.onboardingStep = onboardingStep;
    if (aiCallerName !== undefined) orgUpdate.aiCallerName = aiCallerName;
    if (aiCallerCompany !== undefined) orgUpdate.aiCallerCompany = aiCallerCompany;
    if (aiCallerPhone !== undefined) orgUpdate.aiCallerPhone = aiCallerPhone;
    if (aiSystemPrompt !== undefined)
      orgUpdate.aiSystemPrompt = aiSystemPrompt && aiSystemPrompt.length > 0 ? aiSystemPrompt : null;

    if (Object.keys(orgUpdate).length > 0) {
      await prisma.organization.update({ where: { id: organizationId }, data: orgUpdate });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/settings/team
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
  const { organizationId } = (req as AuthRequest).user!;
  const { role } = req.body;

  if (!["ADMIN", "MEMBER", "VIEWER"].includes(role)) {
    return res.status(400).json({ error: "Invalid role. Must be ADMIN, MEMBER, or VIEWER" });
  }

  const target = await prisma.user.findFirst({
    where: { id: req.params.userId, organizationId },
  });
  if (!target) return res.status(404).json({ error: "User not found" });

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
