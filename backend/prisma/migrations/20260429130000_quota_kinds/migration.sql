-- Quota kinds migration (Phase 1, Agent 2).
--
-- Adds explicit per-resource monthly limits to Plan, and the matching
-- counters on UsageRecord, so the new `meterAndCharge(orgId, kind, units)`
-- helper can enforce quotas atomically per kind.
--
-- New on Plan (all nullable; null == unlimited):
--   maxPlacesPerMonth        — Google Places lookups (per result returned)
--   maxGeminiTokensPerMonth  — Gemini total token usage
--   maxCallsPerMonth         — Vapi call dispatches (parallels existing
--                              monthlyCallQuota; the new column is optional
--                              and meterAndCharge falls back to
--                              monthlyCallQuota when null)
--   maxEmailsPerMonth        — Outbound emails (notification-service)
--
-- New on UsageRecord (all default 0):
--   placesScraped — incremented per Place returned by the Places API
--   emailsSent    — incremented per email dispatched
--
-- The existing `leadsScraped` column is preserved for backwards compatibility
-- with the old assertWithinQuota("lead") path; we don't touch it here.

ALTER TABLE "Plan"
  ADD COLUMN "maxPlacesPerMonth" INTEGER,
  ADD COLUMN "maxGeminiTokensPerMonth" INTEGER,
  ADD COLUMN "maxCallsPerMonth" INTEGER,
  ADD COLUMN "maxEmailsPerMonth" INTEGER;

ALTER TABLE "UsageRecord"
  ADD COLUMN "placesScraped" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailsSent"    INTEGER NOT NULL DEFAULT 0;
