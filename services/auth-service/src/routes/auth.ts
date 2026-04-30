import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import {
  prisma,
  assertSeatAvailableForLimit,
  SeatLimitExceededError,
  signTenantAccessToken,
  passwordChecks,
  isStrongPassword,
} from "@callora/shared";
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

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function newVerifyToken(): { raw: string; hashed: string; exp: Date } {
  const raw = crypto.randomBytes(32).toString("hex");
  return {
    raw,
    hashed: sha256(raw),
    exp: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

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

function rejectWeakPassword(res: Response, pw: string): boolean {
  if (isStrongPassword(pw)) return false;
  res.status(400).json({
    error: "WEAK_PASSWORD",
    message:
      "Password must be at least 8 chars and include upper, lower, digit, and special character.",
    checks: passwordChecks(pw),
  });
  return true;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string(),
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
  if (rejectWeakPassword(res, password)) return;

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
    const verify = newVerifyToken();

    const result = await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const org = await tx.organization.create({
        data: { name: orgName, status: "TRIAL" },
      });
      await assertSeatAvailableForLimit(org.id, freePlan.seatLimit, tx);
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: "ADMIN",
          organizationId: org.id,
          emailVerified: false,
          verifyToken: verify.hashed,
          verifyTokenExp: verify.exp,
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

    fetch(`${NOTIFICATION_SERVICE_URL}/internal/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: "verifyEmail",
        to: email,
        data: { name, verifyUrl: buildVerifyUrl(verify.raw) },
      }),
    }).catch((err) =>
      console.error("[auth-service] verify email send failed", err)
    );

    await sendNotificationEmail("welcome", result.user.email, {
      name: result.user.name ?? "",
      orgName: result.org.name,
      trialEndDate: result.subscription.trialEndsAt,
    });

    res.status(201).json({ success: true, userId: result.user.id });
  } catch (error: any) {
    if (error instanceof SeatLimitExceededError || error?.name === "SeatLimitExceededError") {
      return res.status(402).json({
        error: "seat_limit_exceeded",
        message: error.message,
        current: error.current,
        limit: error.limit,
      });
    }
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

    if (!user.emailVerified) {
      return res.status(403).json({
        error: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before signing in.",
      });
    }

    const token = signTenantAccessToken({
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
      tokenVersion: (user as any).tokenVersion ?? 0,
    });

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

// VERIFY EMAIL — POST (preferred) and GET (legacy)
async function handleVerify(rawToken: string, res: Response) {
  if (!rawToken) return res.status(400).json({ error: "missing token" });
  const hashed = sha256(rawToken);

  // Look up by hashed token first, fall back to raw (legacy data written
  // before this change stored the token raw).
  let user = await prisma.user.findFirst({ where: { verifyToken: hashed } });
  if (!user) {
    user = await prisma.user.findFirst({ where: { verifyToken: rawToken } });
  }
  if (!user) return res.status(400).json({ error: "invalid or expired token" });
  if (user.emailVerified) {
    return res.json({ success: true, alreadyVerified: true, redirect: "/onboarding" });
  }
  if (!user.verifyTokenExp || user.verifyTokenExp < new Date()) {
    return res.status(400).json({ error: "Verification link expired" });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verifyToken: null, verifyTokenExp: null },
  });
  res.json({ success: true, redirect: "/onboarding" });
}

router.get("/verify-email", async (req: Request, res: Response) => {
  return handleVerify(String(req.query.token ?? ""), res);
});

router.post("/verify-email", async (req: Request, res: Response) => {
  const token = String(req.body?.token ?? "");
  return handleVerify(token, res);
});

// RESEND VERIFICATION (public; doesn't reveal whether email exists)
router.post("/resend-verification", async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "");
  try {
    if (email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.emailVerified) {
        const v = newVerifyToken();
        await prisma.user.update({
          where: { id: user.id },
          data: { verifyToken: v.hashed, verifyTokenExp: v.exp },
        });
        await sendNotificationEmail("verifyEmail", user.email, {
          name: user.name ?? "",
          verifyUrl: buildVerifyUrl(v.raw),
        });
      }
    }
  } catch (err) {
    console.error("resend-verification error:", err);
  }
  res.json({ ok: true });
});

// AUTHENTICATED RESEND
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

      const v = newVerifyToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { verifyToken: v.hashed, verifyTokenExp: v.exp },
      });

      await sendNotificationEmail("verifyEmail", user.email, {
        name: user.name ?? "",
        verifyUrl: buildVerifyUrl(v.raw),
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
    return res.json({ success: true });
  }
  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.json({ success: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3600_000);

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
    res.json({ success: true });
  }
});

// RESET PASSWORD
const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string(),
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  const { token, newPassword } = parsed.data;
  if (rejectWeakPassword(res, newPassword)) return;

  try {
    const record = await prisma.passwordResetToken.findFirst({
      where: { token, used: false, expiresAt: { gt: new Date() } },
    });
    if (!record) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { password: hashed, tokenVersion: { increment: 1 } as any },
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

// Suppress unused-warning for SECRET (kept for future direct-sign use)
void SECRET;
void jwt;

export default router;
