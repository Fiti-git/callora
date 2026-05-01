/**
 * /api/me — tenant self-status + onboarding wizard endpoints. Ported from
 * backend/src/routes/me.ts.
 *
 * The standard auth middleware (`requireAuth`) blocks PAST_DUE / SUSPENDED
 * orgs with 402 — which is the whole reason this router has its OWN
 * "permissive" auth: the failed-payment banner and the onboarding wizard
 * are rendered in those exact states. The dashboard always needs to learn
 * whether to show the dunning banner.
 *
 * The `enqueueProvisioning` action delegates to calling-service via
 * `POST /internal/numbers/provision` (the same idempotent endpoint
 * platform-service uses for retries). This lets us avoid pulling BullMQ
 * into auth-service.
 */
import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "@callora/shared";
import type { AuthRequest } from "../middleware/requireAuth.js";
import { writeAuditLog } from "../lib/audit.js";
import { scrubBrandStrings } from "../lib/brandScrub.js";
import { orgRateLimit } from "../lib/rateLimit.js";

const router = express.Router();
const SECRET = process.env.NEXTAUTH_SECRET || "fallback_secret";
const CALLING_SERVICE_URL =
  process.env.CALLING_SERVICE_URL || "http://calling-service:4004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

function internalHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (INTERNAL_TOKEN) h["x-internal-token"] = INTERNAL_TOKEN;
  return h;
}

/**
 * Permissive auth: accepts any non-CANCELED org so PAST_DUE/SUSPENDED
 * tenants can still poll /me/status + /me/provisioning-status. Token-version
 * revocation is still enforced.
 */
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
        select: { id: true, tokenVersion: true } as any,
      }),
    ]);
    if (!org || !user) return res.status(401).json({ error: "Unauthorized" });
    const tokenVersion = typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0;
    if (tokenVersion !== ((user as any).tokenVersion ?? 0)) {
      return res.status(401).json({ error: "Unauthorized: Token revoked" });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}

/**
 * GET /api/me/billing-mode — single source of truth for hiding BYOK
 * affordances in the frontend.
 */
router.get("/billing-mode", permissiveAuth, async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { billingMode: true } as any,
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({ billingMode: (org as any).billingMode });
});

/**
 * GET /api/me/status — org status + dunning + PAYG balance. Lets the
 * dashboard layout render LowCredit / NoCredit / dunning banners from a
 * single fetch.
 */
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

  const lowBalanceThresholdCents = Number(
    process.env.PAYG_LOW_BALANCE_ALERT_CENTS ?? 1000
  );
  const balanceCents = ledger?.balanceCents ?? 0;
  const isOutOfCredits = (org?.status as string | undefined) === "PAUSED_NO_CREDIT";
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
// Onboarding wizard endpoints.
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
 * `failureReason` as a final defence-in-depth.
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
 * PATCH /api/me/business-profile — saves caller persona.
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
 * Enqueue the hosted-tier provisioning flow. Delegates to calling-service
 * `/internal/numbers/provision`, which runs the M4 worker pipeline.
 */
async function enqueueProvisioningViaCalling(
  organizationId: string
): Promise<{ jobId: string | null }> {
  const r = await fetch(`${CALLING_SERVICE_URL}/internal/numbers/provision`, {
    method: "POST",
    headers: internalHeaders(),
    body: JSON.stringify({ orgId: organizationId }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`calling-service /numbers/provision ${r.status}: ${body}`);
  }
  const data = (await r.json().catch(() => ({}))) as { jobId?: string };
  return { jobId: data.jobId ?? null };
}

/**
 * POST /api/me/provisioning/start — kicks off provisioning from the wizard
 * after Step 1 (payment method) and Step 2 (business profile).
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
      return res.status(409).json({ error: "ALREADY_STARTED", status: row.status });
    }

    try {
      const { jobId } = await enqueueProvisioningViaCalling(organizationId);
      await writeAuditLog(req, "PROVISIONING_STARTED", "Organization", organizationId, {
        jobId: jobId ?? undefined,
      });
      res.json({ enqueued: true, jobId });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[me] enqueueProvisioning failed:", err);
      res.status(502).json({ error: "PROVISIONING_ENQUEUE_FAILED" });
    }
  }
);

/**
 * POST /api/me/provisioning/retry — tenant-callable retry after a FAILED
 * provisioning attempt. Rate-limited 5/h/org.
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

    const failureAge = Date.now() - new Date(row.updatedAt).getTime();
    if (failureAge > 24 * 60 * 60 * 1000) {
      return res.status(409).json({ error: "RETRY_WINDOW_EXPIRED" });
    }

    try {
      const { jobId } = await enqueueProvisioningViaCalling(organizationId);
      await writeAuditLog(
        req,
        "PROVISIONING_RETRIED_BY_TENANT",
        "Organization",
        organizationId,
        { jobId: jobId ?? undefined }
      );
      res.json({ enqueued: true, jobId });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[me] enqueueProvisioning retry failed:", err);
      res.status(502).json({ error: "PROVISIONING_ENQUEUE_FAILED" });
    }
  }
);

export default router;
