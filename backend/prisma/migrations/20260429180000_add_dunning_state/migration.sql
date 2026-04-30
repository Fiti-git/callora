-- Phase 2 Agent 8 — Dunning automation + Stripe webhook idempotency.
--
-- 1. DunningStatus enum + DunningState table — drives the multi-day retry
--    state machine processed by the dunningWorker.
-- 2. StripeWebhookEvent table — idempotency guard so the same Stripe event id
--    is never processed twice (even on retried deliveries).

-- ---------------------------------------------------------------------------
-- DunningStatus enum
-- ---------------------------------------------------------------------------
CREATE TYPE "DunningStatus" AS ENUM (
  'ACTIVE',
  'RETRY_SCHEDULED',
  'WARNED',
  'SUSPENDED',
  'RESOLVED',
  'CANCELED'
);

-- ---------------------------------------------------------------------------
-- DunningState table
-- ---------------------------------------------------------------------------
CREATE TABLE "DunningState" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "invoiceId"        TEXT NOT NULL,
  "subscriptionId"   TEXT,
  "attempt"          INTEGER NOT NULL DEFAULT 0,
  "status"           "DunningStatus" NOT NULL DEFAULT 'ACTIVE',
  "firstFailedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextActionAt"     TIMESTAMP(3) NOT NULL,
  "lastEmailSentAt"  TIMESTAMP(3),
  "resolvedAt"       TIMESTAMP(3),
  "amountDueCents"   INTEGER,
  "currency"         TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DunningState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DunningState_invoiceId_key" ON "DunningState"("invoiceId");
CREATE INDEX "DunningState_organizationId_status_idx" ON "DunningState"("organizationId", "status");
CREATE INDEX "DunningState_nextActionAt_status_idx" ON "DunningState"("nextActionAt", "status");

ALTER TABLE "DunningState"
  ADD CONSTRAINT "DunningState_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- StripeWebhookEvent — idempotency
-- ---------------------------------------------------------------------------
CREATE TABLE "StripeWebhookEvent" (
  "id"          TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "livemode"    BOOLEAN NOT NULL DEFAULT false,
  "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");
CREATE INDEX "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");
