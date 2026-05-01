// Simple in-memory TTL cache for secret values.
// Concurrent reads share the same in-flight Promise so we never hit the
// backend twice for the same key in parallel.

// 60s default. Short enough that admin-UI secret edits propagate across all
// bundles within a minute. Long enough to absorb hot loops in workers.
const DEFAULT_TTL_MS = 60 * 1000;

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const entries = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

export function getCached(name: string, now: number = Date.now()): string | undefined {
  const entry = entries.get(name);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    entries.delete(name);
    return undefined;
  }
  return entry.value;
}

export function setCached(name: string, value: string, ttlMs: number = DEFAULT_TTL_MS): void {
  entries.set(name, { value, expiresAt: Date.now() + ttlMs });
}

export function getInflight(name: string): Promise<string> | undefined {
  return inflight.get(name);
}

export function setInflight(name: string, p: Promise<string>): void {
  inflight.set(name, p);
}

export function clearInflight(name: string): void {
  inflight.delete(name);
}

export function clearCache(): void {
  entries.clear();
  inflight.clear();
}

export const SECRET_TTL_MS = DEFAULT_TTL_MS;
