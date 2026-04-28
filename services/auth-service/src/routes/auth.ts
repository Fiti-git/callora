import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@callora/shared";
import {
  requireAuth,
  requireAuthAllowUnverified,
  AuthRequest,
} from "../middleware/requireAuth.js";

const router = express.Router();
const SECRET = process.env.NEXTAUTH_SECRET || "fallback_secret";
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TENANT_APP_ORIGIN = process.env.TENANT_APP_ORIGIN ?? APP_URL;
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4008";

async function sendNotificationEmail(
  template: string,
  to: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${NOTIFICATION_SERVICE_URL}/internal/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, to, data }),
    });
  } catch (err) {
    console.error(`[email] Failed to call notification-service for ${template}:`, err);
  }
}

function buildVerifyUrl(token: string): string {
  return `${TENANT_APP_ORIGIN}/verify-email?token=${token}`;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  orgName: z.string().min(1),
});

// REGISTER
router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }
  const { email, password, name, orgName } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "User exists" });

    const freePlan = await prisma.plan.findUnique({ where: { tier: "FREE" } });
    if (!freePlan) {
      return res
        .status(500)
        .json({ error: "FREE plan not configured. Run seed-plans." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const verifyToken = randomUUID();
    const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const org = await tx.organization.create({
        data: { name: orgName, status: "TRIAL" },
      });
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: "ADMIN",
          organizationId: org.id,
          emailVerified: false,
          verifyToken,
          verifyTokenExp,
        },
      });
      const subscription = await tx.subscription.create({
        data: {
          organizationId: org.id,
          planId: freePlan.id,
          status: "TRIALING",
          trialEndsAt,
        },
      });
      return { user, org, subscription };
    });

    // Send the verification email (fire-and-forget). Failure should not block
    // registration — the user can request a resend.
    fetch(`${NOTIFICATION_SERVICE_URL}/internal/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: "verifyEmail",
        to: email,
        data: { name, verifyUrl: buildVerifyUrl(verifyToken) },
      }),
    }).catch((err) =>
      console.error("[auth-service] verify email send failed", err)
    );

    // Keep the existing welcome email too — gives the user product context
    // even before they verify.
    await sendNotificationEmail("welcome", result.user.email, {
      name: result.user.name ?? "",
      orgName: result.org.name,
      trialEndDate: result.subscription.trialEndsAt,
    });

    res.status(201).json({ success: true, userId: result.user.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: user.organizationId,
        email: user.email,
        role: user.role,
      },
      SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// VERIFY EMAIL
router.get("/verify-email", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  if (!token) return res.status(400).json({ error: "missing token" });
  const user = await prisma.user.findFirst({
    where: { verifyToken: token, verifyTokenExp: { gt: new Date() } },
  });
  if (!user) return res.status(400).json({ error: "invalid or expired token" });
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verifyToken: null, verifyTokenExp: null },
  });
  res.json({ success: true, redirect: "/onboarding" });
});

// RESEND VERIFICATION EMAIL
router.post(
  "/resend-verify",
  requireAuthAllowUnverified,
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthRequest).user!;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "user not found" });
      if (user.emailVerified) {
        return res.json({ ok: true, alreadyVerified: true });
      }

      const verifyToken = randomUUID();
      const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: { verifyToken, verifyTokenExp },
      });

      await sendNotificationEmail("verifyEmail", user.email, {
        name: user.name ?? "",
        verifyUrl: buildVerifyUrl(verifyToken),
      });

      res.json({ ok: true });
    } catch (error: any) {
      console.error("resend-verify error:", error);
      res.status(500).json({ error: "Failed to resend verification" });
    }
  }
);

// FORGOT PASSWORD
const forgotSchema = z.object({ email: z.string().email() });

router.post("/forgot-password", async (req: Request, res: Response) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    // Don't leak validation errors — same generic response either way
    return res.json({ success: true });
  }
  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.json({ success: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3600_000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt, used: false },
    });

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    await sendNotificationEmail("passwordReset", user.email, {
      name: user.name ?? "",
      resetUrl,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("forgot-password error:", error);
    // Still return success to avoid leaking info
    res.json({ success: true });
  }
});

// RESET PASSWORD
const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  const { token, newPassword } = parsed.data;

  try {
    const record = await prisma.passwordResetToken.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });
    if (!record) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { password: hashed },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);

    res.json({ success: true });
  } catch (error: any) {
    console.error("reset-password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ME (session)
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const { userId, organizationId } = (req as AuthRequest).user!;

  const [user, org] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, organizationId: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        status: true,
        onboardingStep: true,
        subscription: {
          select: {
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            plan: { select: { tier: true, name: true } },
          },
        },
      },
    }),
  ]);

  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    ...user,
    organization: {
      status: org?.status,
      onboardingStep: org?.onboardingStep ?? "verify_email",
      subscription: org?.subscription ?? null,
    },
  });
});

export default router;
