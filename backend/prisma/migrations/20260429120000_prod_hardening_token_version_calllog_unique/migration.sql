-- =====================================================================
-- MANUAL PREREQUISITE — READ BEFORE APPLYING THIS MIGRATION
-- =====================================================================
-- The unique index added below (`CallLog_vapiCallId_key`) WILL FAIL on any
-- database that already contains duplicate `vapiCallId` rows. You MUST run
-- the dedup script FIRST against the target database:
--
--     cd backend
--     npm run dedup:vapi-call-ids                # dry-run preview
--     npm run dedup:vapi-call-ids -- --apply     # actually delete
--
-- The script keeps the OLDEST row per vapiCallId and deletes the rest in a
-- single transaction. Take a fresh DB backup before running with --apply.
-- DO NOT skip this step on production data.
-- =====================================================================

-- Prod-hardening migration (Phase 1, Agent 1).
--
-- 1. User.tokenVersion: incremented on password reset; auth middleware compares
--    JWT's tokenVersion against this column and rejects mismatches. Lets us
--    revoke every active JWT for a user without keeping a token blacklist.
--
-- 2. CallLog.vapiCallId @unique: required for idempotent webhook upserts. If
--    the live DB happens to contain duplicate vapiCallId rows from before this
--    migration, the CREATE UNIQUE INDEX will fail. The dedup script
--    (backend/scripts/dedup-vapi-call-ids.ts) is the supported path — it
--    keeps the OLDEST row per vapiCallId because that's the one the campaign
--    worker created on the original dispatch; later duplicates are webhook
--    re-fires (Vapi retries on transient failures). Preserving the original
--    keeps lead.callAttempts and createdAt timestamps consistent.
--
--    If you must run a manual SQL fallback, the equivalent of the dedup
--    script is:
--
--      DELETE FROM "CallLog" a
--      USING "CallLog" b
--      WHERE a."vapiCallId" IS NOT NULL
--        AND a."vapiCallId" = b."vapiCallId"
--        AND a."createdAt" > b."createdAt";
--
--    (keeps the OLDEST row for each vapiCallId — note the `>`; reversing the
--    comparison would keep the newest and contradict the dedup script.)
--    DO NOT run this without a fresh DB backup.

ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "CallLog_vapiCallId_key" ON "CallLog"("vapiCallId");
