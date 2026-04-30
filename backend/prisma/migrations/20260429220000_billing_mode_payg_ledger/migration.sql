-- Phase 5 Agent M1 — Model B PAYG schema additions.
--
-- Adds:
--   * BillingMode + ProvisioningStatus enums
--   * Organization.billingMode column (default 'PAYG')
--   * TenantProvisioning, CreditLedger, CreditTransaction tables
--
-- Existing rows automatically receive billingMode = 'PAYG' via the column
-- DEFAULT. NOTE: staging / QA orgs that were operating in BYOK mode prior to
-- this migration must be flipped to 'BYOK' manually after this runs — there
-- is no programmatic way to detect that prior usage from the schema alone.
-- Use:
--   UPDATE "Organization" SET "billingMode" = 'BYOK' WHERE id IN (...);

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "BillingMode" AS ENUM ('PAYG', 'SUBSCRIPTION', 'BYOK');
CREATE TYPE "ProvisioningStatus" AS ENUM (
  'PENDING',
  'PROVISIONING',
  'READY',
  'FAILED',
  'SUSPENDED',
  'DEPROVISIONED'
);

-- ---------------------------------------------------------------------------
-- Organization.billingMode
-- ---------------------------------------------------------------------------
ALTER TABLE "Organization"
  ADD COLUMN "billingMode" "BillingMode" NOT NULL DEFAULT 'PAYG';

-- ---------------------------------------------------------------------------
-- TenantProvisioning
-- ---------------------------------------------------------------------------
CREATE TABLE "TenantProvisioning" (
  "id"                     TEXT NOT NULL,
  "organizationId"         TEXT NOT NULL,
  "status"                 "ProvisioningStatus" NOT NULL DEFAULT 'PENDING',
  "vapiAssistantId"        TEXT,
  "vapiPhoneNumberId"      TEXT,
  "vapiPhoneE164"          TEXT,
  "stripeCustomerId"       TEXT,
  "defaultPaymentMethodId" TEXT,
  "failureReason"          TEXT,
  "steps"                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  "provisionedAt"          TIMESTAMP(3),
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenantProvisioning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantProvisioning_organizationId_key"
  ON "TenantProvisioning" ("organizationId");
CREATE INDEX "TenantProvisioning_status_idx"
  ON "TenantProvisioning" ("status");

ALTER TABLE "TenantProvisioning"
  ADD CONSTRAINT "TenantProvisioning_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CreditLedger
-- ---------------------------------------------------------------------------
CREATE TABLE "CreditLedger" (
  "id"                          TEXT NOT NULL,
  "organizationId"              TEXT NOT NULL,
  "balanceCents"                INTEGER NOT NULL DEFAULT 0,
  "lifetimeAddedCents"          INTEGER NOT NULL DEFAULT 0,
  "lifetimeSpentCents"          INTEGER NOT NULL DEFAULT 0,
  "autoRechargeEnabled"         BOOLEAN NOT NULL DEFAULT true,
  "autoRechargeThresholdCents"  INTEGER NOT NULL DEFAULT 1000,
  "autoRechargeAmountCents"     INTEGER NOT NULL DEFAULT 2500,
  "lastAutoRechargeAt"          TIMESTAMP(3),
  "lowBalanceAlertSentAt"       TIMESTAMP(3),
  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditLedger_organizationId_key"
  ON "CreditLedger" ("organizationId");

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CreditTransaction
-- ---------------------------------------------------------------------------
CREATE TABLE "CreditTransaction" (
  "id"                TEXT NOT NULL,
  "ledgerId"          TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "kind"              TEXT NOT NULL,
  "amountCents"       INTEGER NOT NULL,
  "balanceAfterCents" INTEGER NOT NULL,
  "ref"               TEXT,
  "metadata"          JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditTransaction_organizationId_createdAt_idx"
  ON "CreditTransaction" ("organizationId", "createdAt");
CREATE INDEX "CreditTransaction_ref_idx"
  ON "CreditTransaction" ("ref");

ALTER TABLE "CreditTransaction"
  ADD CONSTRAINT "CreditTransaction_ledgerId_fkey"
    FOREIGN KEY ("ledgerId") REFERENCES "CreditLedger" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditTransaction"
  ADD CONSTRAINT "CreditTransaction_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
