import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Spend-cap middleware.
 *
 * Calls billing-service:
 *   POST /internal/spend-cap/check { orgId, costCents }
 *     → 200 ok            → allow
 *     → 402 spend_cap_exceeded { scope, capCents } → block
 *
 * MUST be mounted AFTER tenantAuth so x-organization-id is present.
 *
 * Estimated cost reservations (cents). These are pre-action reservations,
 * not authoritative billing — actual cost is reconciled by the worker /
 * usage-reporter after the action completes.
 *
 *   - campaign-run     → 100 cents (~$1.00) — kicks off many calls
 *   - call-trigger     → 50  cents (~$0.50) — single Vapi call reservation
 *   - lead-scrape      → 25  cents (~$0.25) — Places + Gemini batch
 */

const BILLING_SERVICE_URL =
  process.env.BILLING_SERVICE_URL || "http://billing-service:4006";
const BILLING_TIMEOUT_MS = Number(process.env.SPEND_CAP_TIMEOUT_MS) || 1500;

export const SPEND_CAP_RESERVATIONS = {
  "campaign-run": Number(process.env.SPEND_CAP_CAMPAIGN_RUN_CENTS) || 100,
  "call-trigger": Number(process.env.SPEND_CAP_CALL_TRIGGER_CENTS) || 50,
  "lead-scrape": Number(process.env.SPEND_CAP_LEAD_SCRAPE_CENTS) || 25,
} as const;

export type SpendCapAction = keyof typeof SPEND_CAP_RESERVATIONS;

interface SpendCapExceededBody {
  error?: string;
  scope?: string;
  capCents?: number;
}

export interface SpendCapOptions {
  action: SpendCapAction;
  /** Only enforce on these HTTP methods (default: ["POST"]). */
  methods?: string[];
}

export function spendCap(opts: SpendCapOptions): RequestHandler {
  const { action } = opts;
  const methods = opts.methods ?? ["POST"];
  const methodSet = new Set(methods.map((m) => m.toUpperCase()));
  const costCents = SPEND_CAP_RESERVATIONS[action];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!methodSet.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const orgIdHeader = req.headers["x-organization-id"];
    const orgId = Array.isArray(orgIdHeader) ? orgIdHeader[0] : orgIdHeader;
    if (!orgId) {
      next();
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BILLING_TIMEOUT_MS);

    try {
      const r = await fetch(`${BILLING_SERVICE_URL}/internal/spend-cap/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId, costCents, action }),
        signal: controller.signal,
      });

      if (r.status === 402) {
        let body: SpendCapExceededBody = {};
        try {
          body = (await r.json()) as SpendCapExceededBody;
        } catch {
          // ignore body parse error
        }
        res.status(402).json({
          error: "spend_cap_exceeded",
          scope: body.scope ?? "org",
          capCents: body.capCents ?? null,
          action,
        });
        return;
      }

      if (!r.ok) {
        // Non-OK, non-402 — soft-allow with loud log.
        // eslint-disable-next-line no-console
        console.error(
          `[api-gateway] spend-cap non-OK ${r.status} for org=${orgId} action=${action} — soft-allow`
        );
        res.setHeader("X-SpendCap-Soft-Allow", "1");
      }
      next();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[api-gateway] spend-cap unreachable (soft-allow) org=${orgId} action=${action}:`,
        err instanceof Error ? err.message : err
      );
      res.setHeader("X-SpendCap-Soft-Allow", "1");
      next();
    } finally {
      clearTimeout(timer);
    }
  };
}
