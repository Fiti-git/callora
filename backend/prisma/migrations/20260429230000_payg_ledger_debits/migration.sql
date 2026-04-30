-- Phase 5 Agent M5 — PAYG ledger debit + credential resolver.
--
-- 1. Add PAUSED_NO_CREDIT to the OrgStatus enum. Soft pause set when the PAYG
--    ledger hits 0 mid-campaign; cleared by a successful TOPUP via webhook.
-- 2. Add UsageRecord.vapiSpendCents — running per-period Vapi spend (cents,
--    post-markup). Lets admin/MRR analytics report spend without scanning
--    the immutable CreditTransaction table.

ALTER TYPE "OrgStatus" ADD VALUE IF NOT EXISTS 'PAUSED_NO_CREDIT';

ALTER TABLE "UsageRecord"
  ADD COLUMN IF NOT EXISTS "vapiSpendCents" INTEGER NOT NULL DEFAULT 0;
