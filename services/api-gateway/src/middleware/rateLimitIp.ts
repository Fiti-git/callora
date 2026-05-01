import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getRedis } from "../lib/redis";

/**
 * Per-IP fixed-window rate limiter backed by Redis.
 *
 * Key scheme: ratelimit:ip:{ip}:{bucket}:{windowEpoch}
 *
 * Defaults (env-overridable):
 *   - signup: SIGNUP_IP_LIMIT (default 5) per SIGNUP_IP_WINDOW_SECONDS (default 3600)
 *   - forgot-password: FORGOT_IP_LIMIT (default 10) per FORGOT_IP_WINDOW_SECONDS (default 3600)
 *
 * Soft-allow on Redis failure (logs loudly).
 */

export interface IpRateLimitOptions {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]!.trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0]!.split(",")[0]!.trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function rateLimitIp(opts: IpRateLimitOptions): RequestHandler {
  const { bucket, limit, windowSeconds } = opts;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = clientIp(req);
    const windowEpoch = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `ratelimit:ip:${ip}:${bucket}:${windowEpoch}`;

    try {
      const redis = getRedis();
      const count = await redis.incr(key);
      if (count === 1) {
        // Set expiry on first hit. Add a small buffer.
        await redis.expire(key, windowSeconds + 5);
      }

      if (count > limit) {
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : windowSeconds;
        res.setHeader("Retry-After", String(retryAfter));
        res.setHeader("X-RateLimit-Limit", String(limit));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.status(429).json({
          error: "rate_limit_exceeded",
          scope: `ip:${bucket}`,
          retryAfter,
        });
        return;
      }

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
      next();
    } catch (err) {
      // Soft-allow on Redis failure — log loudly.
      // eslint-disable-next-line no-console
      console.error(
        `[api-gateway] rateLimitIp soft-allow (redis down): bucket=${bucket} ip=${ip}`,
        err instanceof Error ? err.message : err
      );
      next();
    }
  };
}

export const signupIpLimiter = rateLimitIp({
  bucket: "signup",
  limit: Number(process.env.SIGNUP_IP_LIMIT) || 5,
  windowSeconds: Number(process.env.SIGNUP_IP_WINDOW_SECONDS) || 3600,
});

export const forgotPasswordIpLimiter = rateLimitIp({
  bucket: "forgot-password",
  limit: Number(process.env.FORGOT_IP_LIMIT) || 10,
  windowSeconds: Number(process.env.FORGOT_IP_WINDOW_SECONDS) || 3600,
});
