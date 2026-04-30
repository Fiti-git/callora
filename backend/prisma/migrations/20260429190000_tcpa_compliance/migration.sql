-- Phase 2 Agent 9 — TCPA compliance.
-- Adds: per-lead consent + DNC fields, CallWindowConfig, DNCEntry,
-- EmailSuppression, ResendWebhookEvent.

-- ----- Lead consent + DNC + state/timezone -------------------------------
ALTER TABLE "Lead"
  ADD COLUMN "consentGiven"      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "consentTimestamp"  TIMESTAMP(3),
  ADD COLUMN "consentSource"     TEXT,
  ADD COLUMN "consentIpAddress"  TEXT,
  ADD COLUMN "doNotCall"         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "doNotCallReason"   TEXT,
  ADD COLUMN "doNotCallAt"       TIMESTAMP(3),
  ADD COLUMN "state"             TEXT,
  ADD COLUMN "timezone"          TEXT;

CREATE INDEX "Lead_doNotCall_idx" ON "Lead"("doNotCall");
CREATE INDEX "Lead_state_idx"     ON "Lead"("state");

-- ----- CallWindowConfig --------------------------------------------------
CREATE TABLE "CallWindowConfig" (
  "id"           TEXT         NOT NULL,
  "state"        TEXT         NOT NULL,
  "allowedFrom"  TEXT         NOT NULL,
  "allowedTo"    TEXT         NOT NULL,
  "timezone"     TEXT         NOT NULL,
  "source"       TEXT         NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CallWindowConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CallWindowConfig_state_key" ON "CallWindowConfig"("state");

-- ----- DNCEntry ----------------------------------------------------------
CREATE TABLE "DNCEntry" (
  "id"             TEXT         NOT NULL,
  "phoneHash"      TEXT         NOT NULL,
  "organizationId" TEXT,
  "source"         TEXT         NOT NULL,
  "reason"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DNCEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DNCEntry_phoneHash_organizationId_key" ON "DNCEntry"("phoneHash", "organizationId");
CREATE INDEX "DNCEntry_organizationId_createdAt_idx" ON "DNCEntry"("organizationId", "createdAt");
ALTER TABLE "DNCEntry"
  ADD CONSTRAINT "DNCEntry_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- EmailSuppression --------------------------------------------------
CREATE TABLE "EmailSuppression" (
  "id"             TEXT         NOT NULL,
  "email"          TEXT         NOT NULL,
  "organizationId" TEXT,
  "reason"         TEXT         NOT NULL,
  "source"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailSuppression_email_organizationId_key" ON "EmailSuppression"("email", "organizationId");
CREATE INDEX "EmailSuppression_organizationId_createdAt_idx" ON "EmailSuppression"("organizationId", "createdAt");
ALTER TABLE "EmailSuppression"
  ADD CONSTRAINT "EmailSuppression_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- ResendWebhookEvent (idempotency) ----------------------------------
CREATE TABLE "ResendWebhookEvent" (
  "id"          TEXT         NOT NULL,
  "type"        TEXT         NOT NULL,
  "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "ResendWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResendWebhookEvent_processedAt_idx" ON "ResendWebhookEvent"("processedAt");
CREATE INDEX "ResendWebhookEvent_type_idx"        ON "ResendWebhookEvent"("type");
