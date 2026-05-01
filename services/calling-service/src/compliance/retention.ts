// Recording retention policy by plan tier. Calling-service / a janitor job
// uses this to know when to purge stored Vapi recordings.

export type PlanTier = "FREE" | "STARTER" | "PRO" | "ENTERPRISE" | string;

const RETENTION_DAYS: Record<string, number> = {
  FREE: 7,
  STARTER: 30,
  PRO: 90,
  ENTERPRISE: 365,
};

/**
 * recordingRetentionDays — returns the number of days call recordings may be
 * retained for an org on the given plan tier. Unknown tiers fall back to the
 * most conservative (FREE) bucket.
 */
export function recordingRetentionDays(planTier: PlanTier): number {
  if (!planTier) return RETENTION_DAYS.FREE;
  const key = String(planTier).toUpperCase();
  return RETENTION_DAYS[key] ?? RETENTION_DAYS.FREE;
}
