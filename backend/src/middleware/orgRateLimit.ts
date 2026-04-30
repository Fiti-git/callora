import type { Request, Response, NextFunction } from "express";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  type RateLimiterAbstract,
  type RateLimiterRes,
} from "rate-limiter-flexible";
import { redisConnection } from "../lib/queue.js";
import type { AuthRequest } from "./auth.js";

/**
 * Per-organization rate limiter.
 *
 * Why a second limiter? express-rate-limit keys by IP, which means a single
 * abusive tenant behind a NAT can starve the rest of the org and a legit
 * tenant on a flaky residential IP can be locked out by their neighbours.
 * For expensive endpoints (campaign start, places search, public-API,
 * email-marketing send) we want the budget enforced per organisation
 * instead, so a tenant's quota stays predictable regardless of source IP.
 *
 * Backed by Redis when REDIS_URL is set so multiple backend / microservice
 * instances share state; falls back to an in-memory limiter for tests.
 *
 * 429 response shape (matches spec):
 *   { error: "RATE_LIMITED", retryAfter: <s>, scope: "org" }
 *   Header: Retry-After: <s>
 */

interface OrgRateLimitOptions {
  /** Stable identifier used to namespace the limiter key in Redis. */
  name: string;
  /** Number of requests allowed per `duration` per organisation. */
  points: number;
  /** Window in seconds. */
  duration: number;
}

const limiterCache = new Map<string, RateLimiterAbstract>();

function getLimiter(opts: OrgRateLimitOptions): RateLimiterAbstract {
  const cached = limiterCache.get(opts.name);
  if (cached) return cached;

  // Use the redis client when reachable, otherwise fall back to in-memory.
  // ioredis is tolerant of connect-on-first-command, so the constructor
  // doesn't actually require a live connection here.
  let limiter: RateLimiterAbstract;
  if (process.env.REDIS_URL && process.env.NODE_ENV !== "test") {
    limiter = new RateLimiterRedis({
      storeClient: redisConnection,
      keyPrefix: `rl:org:${opts.name}`,
      points: opts.points,
      duration: opts.duration,
    });
  } else {
    limiter = new RateLimiterMemory({
      keyPrefix: `rl:org:${opts.name}`,
      points: opts.points,
      duration: opts.duration,
    });
  }
  limiterCache.set(opts.name, limiter);
  return limiter;
}

/**
 * Middleware factory. Returns a per-org rate limiter that uses the
 * authenticated `req.user.organizationId` as the key. Requests without a
 * resolved org (i.e. before `authenticate`) fall through unrestricted —
 * pair this middleware AFTER `authenticate` in the chain.
 */
export function orgRateLimit(opts: OrgRateLimitOptions) {
  const limiter = getLimiter(opts);

  return async (req: Request, res: Response, next: NextFunction) => {
    const orgId =
      (req as AuthRequest).user?.organizationId ??
      (req as any).publicApiOrgId ??
      null;

    // No org context — let the IP-level limiter handle it. This middleware
    // is defensive only: production routes always run after authenticate.
    if (!orgId) return next();

    try {
      await limiter.consume(orgId);
      return next();
    } catch (rejection) {
      const r = rejection as RateLimiterRes;
      const retryAfter = Math.max(1, Math.ceil((r.msBeforeNext ?? 1000) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "RATE_LIMITED",
        retryAfter,
        scope: "org",
      });
    }
  };
}

/** Test-only: clear cached limiters between test cases. */
export function __resetOrgRateLimitForTests(): void {
  limiterCache.clear();
}
