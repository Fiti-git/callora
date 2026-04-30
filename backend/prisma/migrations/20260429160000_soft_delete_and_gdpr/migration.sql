-- Phase 1, Agent 6 — Soft delete + GDPR + canonical AuditLog.
--
-- 1. Add `deletedAt` (+ index) to every tenant-data model whose disappearance
--    the tenant initiates. The Prisma client extension at
--    backend/src/lib/prismaSoftDelete.ts injects `deletedAt: null` into all
--    read queries so existing routes continue to work without changes.
-- 2. Add Organization.gdprDeletedAt for the GDPR "delete my org" flow.
-- 3. Extend AuditLog with `targetOrganizationId`, `entity`, `entityId` and the
--    matching indexes for the tenant-side audit-log viewer.
-- 4. Migrate legacy actorType values forward to the canonical set so the
--    tenant audit-log queries (which validate against
--    PLATFORM_USER|TENANT_USER|SYSTEM) don't silently drop historical rows.

-- ---------------------------------------------------------------------------
-- Soft-delete columns + indexes
-- ---------------------------------------------------------------------------

ALTER TABLE "Lead"      ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Contact"   ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Deal"      ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Task"      ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Note"      ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Campaign"  ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "CallLog"   ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Blacklist" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Lead_deletedAt_idx"      ON "Lead"("deletedAt");
CREATE INDEX "Contact_deletedAt_idx"   ON "Contact"("deletedAt");
CREATE INDEX "Deal_deletedAt_idx"      ON "Deal"("deletedAt");
CREATE INDEX "Task_deletedAt_idx"      ON "Task"("deletedAt");
CREATE INDEX "Note_deletedAt_idx"      ON "Note"("deletedAt");
CREATE INDEX "Campaign_deletedAt_idx"  ON "Campaign"("deletedAt");
CREATE INDEX "CallLog_deletedAt_idx"   ON "CallLog"("deletedAt");
CREATE INDEX "Blacklist_deletedAt_idx" ON "Blacklist"("deletedAt");

-- ---------------------------------------------------------------------------
-- Organization.gdprDeletedAt
-- ---------------------------------------------------------------------------

ALTER TABLE "Organization" ADD COLUMN "gdprDeletedAt" TIMESTAMP(3);
CREATE INDEX "Organization_gdprDeletedAt_idx" ON "Organization"("gdprDeletedAt");

-- ---------------------------------------------------------------------------
-- AuditLog: new columns + indexes
-- ---------------------------------------------------------------------------

ALTER TABLE "AuditLog" ADD COLUMN "targetOrganizationId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "entity"               TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "entityId"             TEXT;

CREATE INDEX "AuditLog_targetOrganizationId_createdAt_idx"
  ON "AuditLog"("targetOrganizationId", "createdAt");
CREATE INDEX "AuditLog_entity_entityId_idx"
  ON "AuditLog"("entity", "entityId");

-- Legacy rows: PLATFORM → PLATFORM_USER, TENANT/USER → TENANT_USER.
UPDATE "AuditLog" SET "actorType" = 'PLATFORM_USER' WHERE "actorType" = 'PLATFORM';
UPDATE "AuditLog" SET "actorType" = 'TENANT_USER'   WHERE "actorType" IN ('TENANT', 'USER');
