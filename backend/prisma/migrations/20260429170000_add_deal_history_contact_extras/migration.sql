-- Phase 2 Agent 7 — CRM depth: deal-stage history, contact extras, deal owner.
--
-- 1. Contact: add tags (text[]) + ownerId (FK -> User, nullable) for bulk-tag /
--    bulk-assign-owner flows. tags defaults to {} so existing rows are append-safe.
-- 2. Deal: add ownerId (FK -> User, nullable). The pre-existing assignedToId
--    relation is kept for back-compat; ownerId is the canonical field going
--    forward and the new bulk-assign endpoint writes to it.
-- 3. DealHistory: tenant-facing chronology of stage transitions. Distinct from
--    AuditLog (security record). Cascades on Deal hard-delete; survives
--    soft-delete (soft-delete only stamps Deal.deletedAt).

-- ---------------------------------------------------------------------------
-- Contact: tags + ownerId
-- ---------------------------------------------------------------------------
ALTER TABLE "Contact" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Contact" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Contact_ownerId_idx" ON "Contact"("ownerId");

-- ---------------------------------------------------------------------------
-- Deal: ownerId
-- ---------------------------------------------------------------------------
ALTER TABLE "Deal" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");

-- ---------------------------------------------------------------------------
-- DealHistory
-- ---------------------------------------------------------------------------
CREATE TABLE "DealHistory" (
  "id"             TEXT NOT NULL,
  "dealId"         TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "fromStage"      TEXT,
  "toStage"        TEXT NOT NULL,
  "changedById"    TEXT,
  "reason"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DealHistory_dealId_createdAt_idx" ON "DealHistory"("dealId", "createdAt");
CREATE INDEX "DealHistory_organizationId_createdAt_idx" ON "DealHistory"("organizationId", "createdAt");

ALTER TABLE "DealHistory"
  ADD CONSTRAINT "DealHistory_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealHistory"
  ADD CONSTRAINT "DealHistory_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealHistory"
  ADD CONSTRAINT "DealHistory_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
