import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { authenticator } from "otplib";
import qrcode from "qrcode";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { sendEmail, APP_URL } from "../lib/email.js";
import { welcomeEmail } from "../emails/welcome.js";
import { passwordResetEmail } from "../emails/passwordReset.js";
import { verifyEmailTemplate } from "../emails/verifyEmail.js";
import { requireEnv } from "../lib/env.js";
import { assertSeatAvailableForLimit, SeatLimitExceededError } from "../lib/quota.js";
import { passwordSchema, rejectWeakPassword } from "../lib/passwordPolicy.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import { encryptString, decryptString, isEncrypted } from "../lib/crypto.js";
import { verifySsoIdToken } from "../lib/sso.js";

const router = express.Router();
const SECRET = requireEnv("NEXTAUTH_SECRET");
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
const TENANT_APP_ORIGIN =
  process.env.TENANT_APP_ORIGIN || process.env.APP_URL || APP_URL;

// ----- helpers -----------------------------------------------------------

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

function buildVerifyUrl(rawToken: string): string {
  return `${TENANT_APP_ORIGIN}/verify-email?token=${rawToken}`;
}

function signAccessToken(user: {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  tokenVersion: number;
}): string {
  return jwt.sign(
    {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
      jti: crypto.randomUUID(),
    },
    SECRET,
    { expiresIn: "7d" }
  );
}

async function recordAudit(
  organizationId: string | null,
  actorId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: "TENANT_USER",
        actorId,
        organizationId,
        action,
        metadata: metadata as any,
      },
    });
  } catch (err) {
    if (sentryEnabled) Sentry.captureException(err);
  }
}

// ----- REGISTER ----------------------------------------------------------

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  name: z.string().min(1),
  orgName: z.string().min(1),
});

router.post("/register", async (req: Request, res: Response) => {
  // Phase 5 Agent M1 — billingMode is admin-only. A tenant register body
  // that tries to seed BYOK / SUBSCRIPTION must be rejected before any
  // org row is touched.
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "billingMode")) {
    return res.status(400).json({
      error: "INVALID_BILLING_MODE",
      message: "Billing mode is managed by Callora",
    });
  }
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }
  const { email, password, name, orgName } = parsed.data;

  if (rejectWeakPassword(res, password)) return;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "User exists" });

    const freePlan = await prisma.plan.findUnique({ where: { tier: "FREE" } });
    if (!freePlan) {
      return res
        .status(500)
        .json({ error: "FREE plan not configured. Run seed-plans." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const verify = newVerifyToken();

    const result = await prisma.$transaction(async (tx) => {
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

    // Send verify email + keep welcome too. Both best-effort *for the
    // HTTP response*; verify-email is `required: true` for quota purposes
    // (a quota-exceeded user shouldn't be able to register and never get
    // a verification mail), but if Resend itself fails we still 201.
    const verifyMsg = verifyEmailTemplate(name, buildVerifyUrl(verify.raw));
    sendEmail(email, verifyMsg.subject, verifyMsg.html, {
      organizationId: result.org.id,
      template: "verifyEmail",
      required: true,
    }).catch((err) => {
      if (sentryEnabled) Sentry.captureException(err);
    });

    const { subject, html } = welcomeEmail(
      result.user.name ?? "",
      result.org.name,
      result.subscription.trialEndsAt
    );
    sendEmail(result.user.email, subject, html, {
      organizationId: result.org.id,
      template: "welcome",
      required: false,
    }).catch(() => {});

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

// ----- LOGIN (step 1) ----------------------------------------------------

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

    if (!user.emailVerified) {
      return res.status(403).json({
        error: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before signing in.",
      });
    }

    if (user.twoFAEnabled) {
      const challengeToken = jwt.sign(
        { userId: user.id, twoFAChallenge: true },
        SECRET,
        { expiresIn: "5m" }
      );
      return res.json({ requires2FA: true, challengeToken });
    }

    const token = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      tokenVersion: user.tokenVersion ?? 0,
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

// ----- LOGIN STEP 2 (2FA) ------------------------------------------------

const twoFALoginSchema = z.object({
  challengeToken: z.string().min(1),
  token: z.string().min(1).optional(),
  recoveryCode: z.string().min(1).optional(),
});

router.post("/2fa/login", async (req: Request, res: Response) => {
  const parsed = twoFALoginSchema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.token && !parsed.data.recoveryCode)) {
    return res.status(400).json({ error: "Invalid 2FA payload" });
  }
  const { challengeToken, token: totp, recoveryCode } = parsed.data;

  let challenge: any;
  try {
    challenge = jwt.verify(challengeToken, SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired challenge" });
  }
  if (!challenge?.twoFAChallenge || !challenge?.userId) {
    return res.status(401).json({ error: "Invalid challenge" });
  }

  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
  if (!user || !user.twoFAEnabled || !user.twoFASecret) {
    return res.status(401).json({ error: "2FA not configured" });
  }

  // Decrypt at-rest secret. Legacy plaintext rows pass through unchanged
  // (see lib/crypto.ts) — they get re-encrypted on the next /2fa/verify.
  const storedSecret = decryptString(user.twoFASecret);

  let success = false;
  if (totp) {
    success = authenticator.verify({ token: totp, secret: storedSecret });
  } else if (recoveryCode) {
    const hashed = sha256(recoveryCode);
    if (user.twoFARecoveryCodes.includes(hashed)) {
      // Consume the code (single-use)
      const remaining = user.twoFARecoveryCodes.filter((c) => c !== hashed);
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFARecoveryCodes: { set: remaining } },
      });
      success = true;
    }
  }

  if (!success) {
    await recordAudit(user.organizationId, user.id, "LOGIN_2FA_FAILED");
    return res.status(401).json({ error: "Invalid 2FA code" });
  }

  await recordAudit(user.organizationId, user.id, "LOGIN_2FA_SUCCESS");
  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    tokenVersion: user.tokenVersion ?? 0,
  });
  res.json({
    token: accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
  });
});

// ----- 2FA SETUP / VERIFY / DISABLE --------------------------------------

router.post("/2fa/setup", authenticate, async (req: Request, res: Response) => {
  const { userId, email } = (req as AuthRequest).user!;
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, "Callora", secret);
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

  // Store provisionally — twoFAEnabled stays false until /verify succeeds.
  // Secret is encrypted at rest with AES-256-GCM (see lib/crypto.ts).
  await prisma.user.update({
    where: { id: userId },
    data: { twoFASecret: encryptString(secret), twoFAEnabled: false },
  });

  res.json({ secret, otpauthUrl, qrCodeDataUrl });
});

router.post("/2fa/verify", authenticate, async (req: Request, res: Response) => {
  const { userId, organizationId } = (req as AuthRequest).user!;
  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ error: "Missing token" });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFASecret) {
    return res.status(400).json({ error: "Run /2fa/setup first" });
  }

  // Decrypt for verification. If the stored value is legacy plaintext,
  // we re-encrypt it on the same write below — migrate-on-write.
  const storedSecret = decryptString(user.twoFASecret);
  const wasLegacy = !isEncrypted(user.twoFASecret);

  const ok = authenticator.verify({ token, secret: storedSecret });
  if (!ok) return res.status(400).json({ error: "Invalid TOTP" });

  // Generate 10 recovery codes (raw returned once, hashed stored).
  const rawCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    rawCodes.push(code);
    hashedCodes.push(sha256(code));
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFAEnabled: true,
      twoFARecoveryCodes: { set: hashedCodes },
      // Migrate-on-write: if we read a plaintext secret above, persist the
      // encrypted form now. No-op for already-encrypted rows.
      ...(wasLegacy ? { twoFASecret: encryptString(storedSecret) } : {}),
    },
  });
  await recordAudit(organizationId, userId, "2FA_ENABLED");

  res.json({ success: true, recoveryCodes: rawCodes });
});

const disableSchema = z.object({
  password: z.string().min(1),
  token: z.string().optional(),
  recoveryCode: z.string().optional(),
});

router.post("/2fa/disable", authenticate, async (req: Request, res: Response) => {
  const { userId, organizationId } = (req as AuthRequest).user!;
  const parsed = disableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { password, token, recoveryCode } = parsed.data;
  if (!token && !recoveryCode) {
    return res.status(400).json({ error: "TOTP or recovery code required" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFAEnabled || !user.twoFASecret) {
    return res.status(400).json({ error: "2FA is not enabled" });
  }

  const pwOk = await bcrypt.compare(password, user.password);
  if (!pwOk) return res.status(401).json({ error: "Invalid password" });

  const storedSecret = decryptString(user.twoFASecret);
  let secondFactorOk = false;
  if (token) {
    secondFactorOk = authenticator.verify({ token, secret: storedSecret });
  } else if (recoveryCode) {
    secondFactorOk = user.twoFARecoveryCodes.includes(sha256(recoveryCode));
  }
  if (!secondFactorOk) {
    return res.status(401).json({ error: "Invalid 2FA code" });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFAEnabled: false,
      twoFASecret: null,
      twoFARecoveryCodes: { set: [] },
    },
  });
  await recordAudit(organizationId, userId, "2FA_DISABLED");
  res.json({ success: true });
});

// ----- VERIFY EMAIL ------------------------------------------------------

const verifyBodySchema = z.object({ token: z.string().min(1) });

async function handleVerifyEmail(rawToken: string, res: Response) {
  if (!rawToken) return res.status(400).json({ error: "Missing token" });

  const hashed = sha256(rawToken);
  const user = await prisma.user.findFirst({
    where: { verifyToken: hashed },
  });

  if (!user) {
    // Maybe already verified — be idempotent only if the raw token is unknown
    return res.status(400).json({ error: "Invalid or expired token" });
  }

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

router.post("/verify-email", async (req: Request, res: Response) => {
  const parsed = verifyBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Missing token" });
  return handleVerifyEmail(parsed.data.token, res);
});

// Compatibility GET — server-action `verifyEmail` uses GET ?token=...
router.get("/verify-email", async (req: Request, res: Response) => {
  return handleVerifyEmail(String(req.query.token ?? ""), res);
});

// Resend verification — public; always returns 200 to avoid email enumeration
const resendSchema = z.object({ email: z.string().email().optional() });
router.post("/resend-verification", async (req: Request, res: Response) => {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.email) {
    return res.json({ ok: true });
  }
  const { email } = parsed.data;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified) {
      const v = newVerifyToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { verifyToken: v.hashed, verifyTokenExp: v.exp },
      });
      const msg = verifyEmailTemplate(user.name ?? "", buildVerifyUrl(v.raw));
      sendEmail(user.email, msg.subject, msg.html, {
        organizationId: user.organizationId,
        template: "verifyEmail",
        required: true,
      }).catch((e) => {
        if (sentryEnabled) Sentry.captureException(e);
      });
    }
  } catch (err) {
    if (sentryEnabled) Sentry.captureException(err);
  }
  res.json({ ok: true });
});

// Authenticated resend (used by the verify-email-pending page when a session exists)
router.post(
  "/resend-verify",
  authenticate,
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthRequest).user!;
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
    const msg = verifyEmailTemplate(user.name ?? "", buildVerifyUrl(v.raw));
    try {
      await sendEmail(user.email, msg.subject, msg.html, {
        organizationId: user.organizationId,
        template: "verifyEmail",
        required: true,
      });
    } catch (err: any) {
      if (err?.name === "QuotaExceededError" || err instanceof Error && /quota/i.test(err.message)) {
        return res.status(429).json({
          error: "EMAIL_QUOTA_EXCEEDED",
          message: "Monthly email quota exceeded. Please contact support.",
        });
      }
      throw err;
    }
    res.json({ ok: true });
  }
);

// ----- FORGOT PASSWORD ---------------------------------------------------

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
    const expiresAt = new Date(Date.now() + 3600_000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt, used: false },
    });

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    const { subject, html } = passwordResetEmail(user.name ?? "", resetUrl);
    // password-reset is required: if quota is blown, surface as 429 so
    // the user knows to contact support rather than silently failing.
    try {
      await sendEmail(user.email, subject, html, {
        organizationId: user.organizationId,
        template: "passwordReset",
        required: true,
      });
    } catch (err: any) {
      if (err?.name === "QuotaExceededError") {
        return res.status(429).json({
          error: "EMAIL_QUOTA_EXCEEDED",
          message:
            "Monthly email quota exceeded — password reset emails are temporarily unavailable.",
        });
      }
      // Any other error: stay quiet to avoid email enumeration (existing behaviour).
      console.error("forgot-password send error:", err);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("forgot-password error:", error);
    res.json({ success: true });
  }
});

// ----- RESET PASSWORD ----------------------------------------------------

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
        data: { password: hashed, tokenVersion: { increment: 1 } },
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

// ----- SSO EXCHANGE (Phase 3 Agent 12) ----------------------------------
//
// Frontend NextAuth Google/Microsoft providers POST the provider-issued ID
// token here. We verify the token against the provider's JWKS, find or
// create the User+Organization, and return a normal tenant access JWT.
//
// First login: create Org (default name = email domain), User as ADMIN,
// FREE plan TRIALING subscription, send welcome email.
// Subsequent logins: match by email; require active org membership.
//
// NOTE: monolith is the source of truth for SSO. services/auth-service does
// NOT mirror this endpoint until Phase 4 retires the monolith — the gap is
// documented in services/auth-service/AGENT.md.

const ssoExchangeSchema = z.object({
  provider: z.enum(["GOOGLE", "MICROSOFT"]),
  idToken: z.string().min(20),
});

router.post("/sso/exchange", async (req: Request, res: Response) => {
  const parsed = ssoExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid SSO payload" });
  }
  const { provider, idToken } = parsed.data;

  let identity;
  try {
    identity = await verifySsoIdToken(provider, idToken);
  } catch (err: any) {
    if (err?.message?.startsWith("SSO_NOT_CONFIGURED")) {
      return res.status(503).json({
        error: "SSO_NOT_CONFIGURED",
        message: `${provider} SSO is not enabled on this server`,
      });
    }
    return res.status(400).json({
      error: "INVALID_ID_TOKEN",
      message: process.env.NODE_ENV === "production" ? "Invalid token" : String(err?.message ?? err),
    });
  }

  if (!identity.emailVerified) {
    return res.status(400).json({
      error: "EMAIL_NOT_VERIFIED",
      message: "SSO provider reports email is not verified",
    });
  }

  const { email, name, subject } = identity;
  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      include: { organization: { select: { id: true, status: true } } },
    });

    let user;
    let orgId: string;
    let isNew = false;

    if (existing) {
      // Subsequent login. Forbid if the org has been canceled/suspended.
      const orgStatus = existing.organization?.status;
      if (orgStatus === "SUSPENDED" || orgStatus === "CANCELED") {
        return res.status(403).json({
          error: "ORG_BLOCKED",
          message: `Organization is ${orgStatus}`,
        });
      }
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          lastLoginAt: new Date(),
          // Lock provider/subject to first-seen identity if not set.
          ssoProvider: existing.ssoProvider ?? provider,
          ssoSubject: existing.ssoSubject ?? subject,
          // SSO providers vouch for the email — if the local row was unverified
          // (e.g. created via SSO on a server that didn't auto-verify), flip it.
          emailVerified: true,
          name: existing.name ?? name,
        },
      });
      orgId = existing.organizationId;
    } else {
      // First-time SSO sign-up. Mirror the /register flow.
      const freePlan = await prisma.plan.findUnique({ where: { tier: "FREE" } });
      if (!freePlan) {
        return res.status(500).json({ error: "FREE plan not configured" });
      }
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const orgName = (() => {
        const domain = email.split("@")[1] ?? "";
        if (!domain) return name ?? email;
        const head = domain.split(".")[0];
        return head ? head.charAt(0).toUpperCase() + head.slice(1) : domain;
      })();
      // SSO accounts get a random unguessable password — they can't use
      // it to login but the column is non-null. They can still go through
      // forgot-password to attach a credentials login if desired.
      const ssoPlaceholderPassword = await bcrypt.hash(
        crypto.randomBytes(24).toString("hex"),
        10
      );

      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name: orgName, status: "TRIAL" },
        });
        await assertSeatAvailableForLimit(org.id, freePlan.seatLimit, tx);
        const u = await tx.user.create({
          data: {
            email,
            password: ssoPlaceholderPassword,
            name,
            role: "ADMIN",
            organizationId: org.id,
            emailVerified: true, // SSO provider has verified
            ssoProvider: provider,
            ssoSubject: subject,
            lastLoginAt: new Date(),
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
        return { user: u, org, subscription };
      });

      user = result.user;
      orgId = result.org.id;
      isNew = true;

      const { subject: subj, html } = welcomeEmail(
        result.user.name ?? "",
        result.org.name,
        result.subscription.trialEndsAt
      );
      sendEmail(result.user.email, subj, html, {
        organizationId: result.org.id,
        template: "welcome",
        required: false,
      }).catch(() => {});
    }

    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: orgId,
      tokenVersion: user.tokenVersion ?? 0,
    });

    await recordAudit(orgId, user.id, "SSO_LOGIN", { provider, isNew });

    res.json({
      token: accessToken,
      isNew,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: orgId,
      },
    });
  } catch (err: any) {
    if (err instanceof SeatLimitExceededError || err?.name === "SeatLimitExceededError") {
      return res.status(402).json({
        error: "seat_limit_exceeded",
        message: err.message,
      });
    }
    if (sentryEnabled) Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

// ----- ME ----------------------------------------------------------------

router.get("/me", authenticate, async (req: Request, res: Response) => {
  const { userId, organizationId } = (req as AuthRequest).user!;

  const [user, org] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        emailVerified: true,
        twoFAEnabled: true,
      },
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
