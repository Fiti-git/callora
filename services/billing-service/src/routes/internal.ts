import express, { Request, Response } from "express";
import { z } from "zod";
import {
  assertSpendCap,
  peekSpendCap,
  SpendCapExceededError,
} from "../spendCap.js";
import { reportUsage, type MeterName } from "../services/stripe.js";

const router = express.Router();

const checkSchema = z.object({
  orgId: z.string().min(1),
  costCents: z.number().int().nonnegative(),
});

/**
 * POST /internal/spend-cap/check
 *
 * Called by other services BEFORE incurring billable cost. On success the
 * counters are atomically incremented and a 200 is returned. On failure a 402
 * with cap details is returned. The caller is responsible for actually
 * spending the money — this endpoint reserves the budget.
 */
router.post("/spend-cap/check", async (req: Request, res: Response) => {
  const parsed = checkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }
  try {
    const out = await assertSpendCap(parsed.data.orgId, parsed.data.costCents);
    return res.json(out);
  } catch (err: any) {
    if (err instanceof SpendCapExceededError) {
      return res.status(402).json({
        error: "spend_cap_exceeded",
        scope: err.scope,
        capCents: err.capCents,
        currentCents: err.currentCents,
        attemptedCents: err.attemptedCents,
      });
    }
    console.error("[/internal/spend-cap/check] error:", err);
    return res.status(500).json({ error: "internal_error", message: err?.message });
  }
});

/**
 * GET /internal/spend-cap/:orgId  — read-only state (no mutation).
 */
router.get("/spend-cap/:orgId", async (req: Request, res: Response) => {
  try {
    const data = await peekSpendCap(req.params.orgId);
    return res.json(data);
  } catch (err: any) {
    console.error("[/internal/spend-cap/:orgId] error:", err);
    return res.status(500).json({ error: "internal_error", message: err?.message });
  }
});

const usageSchema = z.object({
  orgId: z.string().min(1),
  meter: z.enum(["call_minutes", "leads_qualified", "number_rental"]),
  quantity: z.number().positive(),
  hourBucket: z.string().min(1),
});

/**
 * POST /internal/usage/report
 *
 * Direct passthrough to Stripe metered usage. Idempotent via hourBucket.
 * Other services may use this for ad-hoc reporting; the hourly cron worker
 * uses the function form directly.
 */
router.post("/usage/report", async (req: Request, res: Response) => {
  const parsed = usageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }
  const { orgId, meter, quantity, hourBucket } = parsed.data;
  const result = await reportUsage(orgId, meter as MeterName, quantity, hourBucket);
  if (!result.ok) {
    return res.status(409).json({ error: "report_failed", reason: result.reason });
  }
  return res.json(result);
});

export default router;
