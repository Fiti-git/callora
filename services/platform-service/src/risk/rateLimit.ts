// Per-org gateway rate-limit counters, stored in Redis. Buckets are simple
// fixed-window counters keyed by `{org}:{bucket}:{windowStart}`.
//
// The api-gateway calls `GET /internal/rate-limit/:orgId/:bucket` to consult
// these counters before allowing a tenant request through. Increments are
// performed by whichever service "owns" the action (campaign-service for
// campaigns_hour, calling-service for calls_minute) by calling the same
// internal endpoint via POST. Both directions share the same key format
// so the counters stay coherent.

import { redisConnection } from "../lib/redis.js";

export type RateLimitBucket = "campaigns_hour" | "calls_minute";

interface BucketSpec {
  windowSeconds: number;
  defaultLimit: number;
  envVar: string;
}

const BUCKETS: Record<RateLimitBucket, BucketSpec> = {
  campaigns_hour: {
    windowSeconds: 60 * 60,
    defaultLimit: 20,
    envVar: "RATE_LIMIT_CAMPAIGNS_PER_HOUR",
  },
  calls_minute: {
    windowSeconds: 60,
    defaultLimit: 30,
    envVar: "RATE_LIMIT_CALLS_PER_MINUTE",
  },
};

export function isRateLimitBucket(s: string): s is RateLimitBucket {
  return s === "campaigns_hour" || s === "calls_minute";
}

export function getLimit(bucket: RateLimitBucket): number {
  const spec = BUCKETS[bucket];
  const raw = process.env[spec.envVar];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : spec.defaultLimit;
}

function currentWindowStart(bucket: RateLimitBucket, now = Date.now()): number {
  const w = BUCKETS[bucket].windowSeconds * 1000;
  return Math.floor(now / w) * w;
}

function key(orgId: string, bucket: RateLimitBucket, now = Date.now()): string {
  return `ratelimit:${orgId}:${bucket}:${currentWindowStart(bucket, now)}`;
}

export async function incrementCounter(
  orgId: string,
  bucket: RateLimitBucket,
  by = 1
): Promise<number> {
  const k = key(orgId, bucket);
  const ttl = BUCKETS[bucket].windowSeconds + 5;
  const pipe = redisConnection.multi();
  pipe.incrby(k, by);
  pipe.expire(k, ttl);
  const res = await pipe.exec();
  // res is [[null, count], [null, 1]]
  const count = res?.[0]?.[1] as number | undefined;
  return typeof count === "number" ? count : by;
}

export async function getCounter(
  orgId: string,
  bucket: RateLimitBucket
): Promise<{ count: number; limit: number; remaining: number; windowSeconds: number }> {
  const limit = getLimit(bucket);
  const raw = await redisConnection.get(key(orgId, bucket));
  const count = raw ? Number(raw) : 0;
  return {
    count,
    limit,
    remaining: Math.max(0, limit - count),
    windowSeconds: BUCKETS[bucket].windowSeconds,
  };
}
