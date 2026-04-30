import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { requireEnv } from "../lib/env.js";
import type { AuthRequest } from "../middleware/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { scrubBrandStrings } from "../services/provisioning/brandScrub.js";
import { enqueueProvisioning } from "../services/provisioning/index.js";
import { orgRateLimit } from "../middleware/orgRateLimit.js";
import { logger } from "../lib/logger.js";

/**
 * Lightweight self-status endpoint for the dashboard layout. Read-only.
 *
 * The standard `authenticate` middleware blocks PAST_DUE / SUSPENDED orgs
 * with 402 — which is the whole reason we need a separate endpoint here:
 * the failed-payment banner is rendered in those exact states. Use a
 * permissive auth that accepts any non-CANCELED org so the frontend can
 * always learn whether to show the dunning banner.
 */
const router = express.Router();
const SECRET = requireEnv("NEXTAUTH_SECRET");

async function permissiveAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET) as any;
    (req as AuthRequest).user = decoded;
    const [org, user] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: decoded.organizationId },
        select: { status: true },
      }),
      prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, tokenVersion: true },
      }),
    ]);
    if (!org || !user) return res.status(401).json({ error: "Unauthorized" });
    const tokenVersion = typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0;
    if (tokenVersion !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: "Unauthorized: Token revoked" });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}

/**
 * Phase 5 Agent M1 — Tenant-facing billing-mode probe. The frontend uses
 * this as the single source of truth for hiding BYOK affordances (key-paste
 * fields, etc.). PAYG is the default; SUBSCRIPTION is dormant; BYOK appears
 * only on Callora-internal QA orgs that an admin flipped manually.
 */
router.get("/billing-mode", permissiveAuth, async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { billingMode: true },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({ billingMode: org.billingMode });
});

router.get("/status", permissiveAuth, async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;

  const [org, dunning, ledger] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    }),
    prisma.dunningState.findFirst({
      where: {
        organizationId,
        status: { notIn: ["RESOLVED", "CANCELED"] },
      },
      orderBy: { firstFailedAt: "asc" },
      select: {
        status: true,
        attempt: true,
        nextActionAt: true,
        invoiceId: true,
        amountDueCents: true,
        currency: true,
        firstFailedAt: true,
        lastEmailSentAt: true,
      },
    }),
    prisma.creditLedger.findUnique({
      where: { organizationId },
      select: { balanceCents: true },
    }),
  ]);

  // Phase 5 Agent M7 — surface PAYG balance flags so the dashboard layout
  // can render the LowCredit / NoCredit banners from a single status fetch.
  const lowBalanceThresholdCents = Number(
    process.env.PAYG_LOW_BALANCE_ALERT_CENTS ?? 1000
  );
  const balanceCents = ledger?.balanceCents ?? 0;
  const isOutOfCredits = org?.status === "PAUSED_NO_CREDIT";
  const isLowBalance =
    !isOutOfCredits && balanceCents > 0 && balanceCents < lowBalanceThresholdCents;

  res.json({
    orgStatus: org?.status ?? null,
    dunning: dunning
      ? {
          status: dunning.status,
          attempt: dunning.attempt,
          nextActionAt: dunning.nextActionAt,
          invoiceId: dunning.invoiceId,
          amountDueCents: dunning.amountDueCents,
          currency: dunning.currency,
          firstFailedAt: dunning.firstFailedAt,
          lastEmailSentAt: dunning.lastEmailSentAt,
        }
      : null,
    balanceCents,
    lowBalanceThresholdCents,
    payg: {
      isLowBalance,
      isOutOfCredits,
    },
  });
});

// ---------------------------------------------------------------------------
// Phase 5 Agent M6 — Onboarding wizard endpoints.
// ---------------------------------------------------------------------------

const PROVISIONING_STEP_KEYS = [
  "customer",
  "paymentMethod",
  "firstTopUp",
  "phoneNumber",
  "assistant",
  "attach",
] as const;
type ProvisioningStepKey = (typeof PROVISIONING_STEP_KEYS)[number];

function normaliseSteps(raw: unknown): Record<ProvisioningStepKey, "done" | "pending"> {
  const out = {} as Record<ProvisioningStepKey, "done" | "pending">;
  const src = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
  for (const k of PROVISIONING_STEP_KEYS) {
    out[k] = src[k] === "done" ? "done" : "pending";
  }
  return out;
}

/**
 * GET /api/me/provisioning-status — wizard polls this every 3s. Permissive
 * auth so PAST_DUE/SUSPENDED orgs can also read their state. Brand-scrubs
 * `failureReason` as a final defence-in-depth even though M4 scrubs at write.
 */
router.get(
  "/provisioning-status",
  permissiveAuth,
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const row = await prisma.tenantProvisioning.findUnique({
      where: { organizationId },
    });

    if (!row) {
      return res.json({
        status: "PENDING",
        steps: normaliseSteps({}),
        completedSteps: 0,
        totalSteps: PROVISIONING_STEP_KEYS.length,
        failureReason: null,
        phoneNumberE164: null,
      });
    }

    const steps = normaliseSteps((row as any).steps);
    const completedSteps = Object.values(steps).filter((v) => v === "done").length;
    const failureReason = row.failureReason
      ? scrubBrandStrings(row.failureReason)
      : null;

    res.json({
      status: row.status,
      steps,
      completedSteps,
      totalSteps: PROVISIONING_STEP_KEYS.length,
      failureReason,
      phoneNumberE164:
        row.status === "READY" ? row.vapiPhoneE164 ?? null : null,
    });
  }
);

const businessProfileSchema = z.object({
  aiCallerName: z.string().trim().min(1).max(50),
  aiCallerCompany: z.string().trim().min(1).max(100),
  aiSystemPrompt: z.string().trim().min(50).max(5000),
});

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&lt;|&gt;/g, "");
}

/**
 * PATCH /api/me/business-profile — saves caller persona. Standard authenticate
 * (block PAST_DUE/SUSPENDED) since onboarding requires a healthy org.
 */
router.patch(
  "/business-profile",
  express.json(),
  permissiveAuth,
  async (req: Request, res: Response) => {
    const parsed = businessProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "VALIDATION_FAILED", details: parsed.error.flatten() });
    }
    const { organizationId } = (req as AuthRequest).user!;
    const data = {
      aiCallerName: stripHtml(parsed.data.aiCallerName),
      aiCallerCompany: stripHtml(parsed.data.aiCallerCompany),
      aiSystemPrompt: stripHtml(parsed.data.aiSystemPrompt),
    };
    await prisma.organization.update({
      where: { id: organizationId },
      data,
    });
    await writeAuditLog(req, "BUSINESS_PROFILE_UPDATED", "Organization", organizationId);
    res.json({ ok: true });
  }
);

/**
 * POST /api/me/provisioning/start — kicks off the M4 orchestrator from the
 * wizard after Step 1 (payment method) and Step 2 (business profile).
 */
router.post(
  "/provisioning/start",
  express.json(),
  permissiveAuth,
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;

    const [org, row] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { aiSystemPrompt: true },
      }),
      prisma.tenantProvisioning.findUnique({
        where: { organizationId },
      }),
    ]);

    if (!org?.aiSystemPrompt || org.aiSystemPrompt.trim().length < 50) {
      return res.status(400).json({ error: "BUSINESS_PROFILE_INCOMPLETE" });
    }
    if (!row?.defaultPaymentMethodId) {
      return res.status(400).json({ error: "PAYMENT_METHOD_REQUIRED" });
    }
    if (row.status && row.status !== "PENDING") {
      // Already running / done / failed — start is only for the first push.
      return res.status(409).json({ error: "ALREADY_STARTED", status: row.status });
    }

    const { jobId } = await enqueueProvisioning(
      organizationId,
      row.defaultPaymentMethodId
    );
    await writeAuditLog(req, "PROVISIONING_STARTED", "Organization", organizationId, {
      jobId,
    });
    res.json({ enqueued: true, jobId });
  }
);

/**
 * POST /api/me/provisioning/retry — tenant-callable retry after a FAILED
 * provisioning attempt. Rate-limited 5/h/org. Only valid when the row is
 * FAILED, has a payment method, and last failure was within the past 24h.
 */
router.post(
  "/provisioning/retry",
  express.json(),
  permissiveAuth,
  orgRateLimit({ name: "me-provisioning-retry", points: 5, duration: 3600 }),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const row = await prisma.tenantProvisioning.findUnique({
      where: { organizationId },
    });
    if (!row) return res.status(404).json({ error: "NO_PROVISIONING_RECORD" });
    if (row.status !== "FAILED") {
      return res
        .status(409)
        .json({ error: "NOT_RETRYABLE", status: row.status });
    }
    if (!row.defaultPaymentMethodId) {
      return res.status(400).json({ error: "PAYMENT_METHOD_REQUIRED" });
    }

    // Recency check: only allow retry if last failure was within 24h. Fall
    // back to `updatedAt` since failureReason doesn't carry a separate ts.
    const failureAge = Date.now() - new Date(row.updatedAt).getTime();
    if (failureAge > 24 * 60 * 60 * 1000) {
      return res.status(409).json({ error: "RETRY_WINDOW_EXPIRED" });
    }

    const { jobId } = await enqueueProvisioning(
      organizationId,
      row.defaultPaymentMethodId
    );
    await writeAuditLog(
      req,
      "PROVISIONING_RETRIED_BY_TENANT",
      "Organization",
      organizationId,
      { jobId }
    );
    res.json({ enqueued: true, jobId });
  }
);

export default router;
