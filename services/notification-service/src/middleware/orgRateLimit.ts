import type { Request, Response, NextFunction } from "express";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  type RateLimiterAbstract,
  type RateLimiterRes,
} from "rate-limiter-flexible";
import { redisConnection } from "../lib/queue.js";
import type { AuthRequest } from "./requireAuth.js";

interface OrgRateLimitOptions {
  name: string;
  points: number;
  duration: number;
}

const limiterCache = new Map<string, RateLimiterAbstract>();

function getLimiter(opts: OrgRateLimitOptions): RateLimiterAbstract {
  const cached = limiterCache.get(opts.name);
  if (cached) return cached;

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

export function orgRateLimit(opts: OrgRateLimitOptions) {
  const limiter = getLimiter(opts);

  return async (req: Request, res: Response, next: NextFunction) => {
    const orgId = (req as AuthRequest).user?.organizationId ?? null;
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
