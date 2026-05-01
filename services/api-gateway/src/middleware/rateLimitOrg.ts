import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Per-organization rate limit middleware.
 *
 * Consults platform-service:
 *   POST /internal/rate-limit/:orgId/:bucket/increment  → increments + returns counter
 *
 * Response shape: { count, limit, remaining, windowSeconds }
 *
 * Buckets used here:
 *   - "campaigns:hour"  → POST /api/campaigns
 *   - "calls:minute"    → call-trigger endpoints (e.g. /api/vapi/* mutating routes)
 *
 * Soft-allow on platform-service failure (logs loudly + flags via header).
 *
 * MUST be mounted AFTER tenantAuth so x-organization-id header is set.
 */

const PLATFORM_SERVICE_URL =
  process.env.PLATFORM_SERVICE_URL || "http://platform-service:4007";
const PLATFORM_TIMEOUT_MS = Number(process.env.PLATFORM_RATE_LIMIT_TIMEOUT_MS) || 1500;

interface RateLimitResponse {
  count: number;
  limit: number;
  remaining: number;
  windowSeconds: number;
}

async function incrementCounter(
  orgId: string,
  bucket: string
): Promise<RateLimitResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLATFORM_TIMEOUT_MS);
  try {
    const url = `${PLATFORM_SERVICE_URL}/internal/rate-limit/${encodeURIComponent(
      orgId
    )}/${encodeURIComponent(bucket)}/increment`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[api-gateway] platform rate-limit non-OK ${res.status} for org=${orgId} bucket=${bucket}`
      );
      return null;
    }
    return (await res.json()) as RateLimitResponse;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[api-gateway] platform rate-limit unreachable (soft-allow) org=${orgId} bucket=${bucket}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface OrgRateLimitOptions {
  bucket: string;
  /** Optional: only enforce on these HTTP methods (default: all). */
  methods?: string[];
}

export function rateLimitOrg(opts: OrgRateLimitOptions): RequestHandler {
  const { bucket, methods } = opts;
  const methodSet = methods ? new Set(methods.map((m) => m.toUpperCase())) : null;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (methodSet && !methodSet.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const orgIdHeader = req.headers["x-organization-id"];
    const orgId = Array.isArray(orgIdHeader) ? orgIdHeader[0] : orgIdHeader;
    if (!orgId) {
      // No org context — let downstream auth handle. Don't rate-limit anonymously.
      next();
      return;
    }

    const result = await incrementCounter(orgId, bucket);
    if (!result) {
      // Soft-allow — flag in response header for ops visibility.
      res.setHeader("X-RateLimit-Soft-Allow", "1");
      next();
      return;
    }

    res.setHeader("X-RateLimit-Limit", String(result.limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
    res.setHeader("X-RateLimit-Bucket", bucket);

    if (result.remaining < 0 || result.count > result.limit) {
      const retryAfter = result.windowSeconds || 60;
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "rate_limit_exceeded",
        scope: `org:${bucket}`,
        limit: result.limit,
        windowSeconds: result.windowSeconds,
        retryAfter,
      });
      return;
    }

    next();
  };
}

export const campaignsHourLimiter = rateLimitOrg({
  bucket: "campaigns:hour",
  methods: ["POST"],
});

export const callsMinuteLimiter = rateLimitOrg({
  bucket: "calls:minute",
  methods: ["POST"],
});
