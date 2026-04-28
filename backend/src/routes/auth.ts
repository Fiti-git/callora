import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { sendEmail, APP_URL } from "../lib/email.js";
import { welcomeEmail } from "../emails/welcome.js";
import { passwordResetEmail } from "../emails/passwordReset.js";

const router = express.Router();
const SECRET = process.env.NEXTAUTH_SECRET || "fallback_secret";
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);

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

    const result = await prisma.$transaction(async (tx) => {
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

    const { subject, html } = welcomeEmail(
      result.user.name ?? "",
      result.org.name,
      result.subscription.trialEndsAt
    );
    await sendEmail(result.user.email, subject, html);

    res.status(201).json({ success: true, userId: result.user.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const { email, password } = parsed.data;

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
    const { subject, html } = passwordResetEmail(user.name ?? "", resetUrl);
    await sendEmail(user.email, subject, html);

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
router.get("/me", authenticate, async (req: Request, res: Response) => {
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
      subscription: org?.subscription ?? null,
    },
  });
});

export default router;
