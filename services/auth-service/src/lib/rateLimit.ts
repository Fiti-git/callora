/**
 * Lightweight in-memory per-org rate limiter for auth-service.
 *
 * The monolith uses `rate-limiter-flexible` with a Redis backend. Adding
 * Redis to auth-service for a single retry endpoint is overkill — a single
 * Node process with an LRU-style map is sufficient because:
 *   1. The retry endpoint allows 5 hits / hour / org. The damage from a
 *      missed limit (e.g. multiple replicas) is bounded by the BullMQ jobId
 *      idempotency check on the downstream provisioning job.
 *   2. The api-gateway also enforces a per-IP `apiLimiter` on top.
 *
 * Returns 429 with { error, retryAfter, scope } when the limit is exceeded.
 */
import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../middleware/requireAuth.js";

interface OrgRateLimitOptions {
  name: string;
  points: number;
  duration: number; // seconds
}

interface Bucket {
  resetAt: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

export function orgRateLimit(opts: OrgRateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const orgId = (req as AuthRequest).user?.organizationId;
    if (!orgId) return next();

    const key = `${opts.name}:${orgId}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { resetAt: now + opts.duration * 1000, count: 1 });
      return next();
    }

    if (existing.count >= opts.points) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "RATE_LIMITED",
        retryAfter,
        scope: "org",
      });
    }

    existing.count++;
    next();
  };
}
