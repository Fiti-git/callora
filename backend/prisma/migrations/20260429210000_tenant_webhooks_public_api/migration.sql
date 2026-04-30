-- Phase 3 Agent 12 — Integrations: SSO, per-tenant webhooks, public API.

-- ----- User SSO + lastLoginAt -------------------------------------------
ALTER TABLE "User"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "ssoProvider" TEXT,
  ADD COLUMN "ssoSubject"  TEXT;

CREATE INDEX "User_ssoProvider_ssoSubject_idx" ON "User"("ssoProvider", "ssoSubject");

-- ----- Organization.zapierTriggerToken ----------------------------------
ALTER TABLE "Organization"
  ADD COLUMN "zapierTriggerToken" TEXT;
CREATE UNIQUE INDEX "Organization_zapierTriggerToken_key" ON "Organization"("zapierTriggerToken");

-- ----- Plan.maxApiCallsPerMonth -----------------------------------------
ALTER TABLE "Plan" ADD COLUMN "maxApiCallsPerMonth" INTEGER;

-- ----- UsageRecord.apiCallsThisMonth ------------------------------------
ALTER TABLE "UsageRecord" ADD COLUMN "apiCallsThisMonth" INTEGER NOT NULL DEFAULT 0;

-- ----- WebhookEvent enum -------------------------------------------------
CREATE TYPE "WebhookEvent" AS ENUM (
  'LEAD_QUALIFIED',
  'CALL_COMPLETED',
  'DEAL_WON',
  'CAMPAIGN_COMPLETED',
  'EMAIL_OPENED',
  'EMAIL_CLICKED'
);

-- ----- TenantWebhook -----------------------------------------------------
CREATE TABLE "TenantWebhook" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "url"            TEXT NOT NULL,
  "events"         "WebhookEvent"[],
  "secret"         TEXT NOT NULL,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "TenantWebhook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TenantWebhook_organizationId_active_idx" ON "TenantWebhook"("organizationId","active");
CREATE INDEX "TenantWebhook_deletedAt_idx" ON "TenantWebhook"("deletedAt");
ALTER TABLE "TenantWebhook"
  ADD CONSTRAINT "TenantWebhook_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- WebhookDelivery ---------------------------------------------------
CREATE TABLE "WebhookDelivery" (
  "id"             TEXT NOT NULL,
  "webhookId"      TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "event"          "WebhookEvent" NOT NULL,
  "payload"        JSONB NOT NULL,
  "status"         TEXT NOT NULL,
  "responseCode"   INTEGER,
  "responseBody"   TEXT,
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt"  TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebhookDelivery_webhookId_status_idx" ON "WebhookDelivery"("webhookId","status");
CREATE INDEX "WebhookDelivery_organizationId_createdAt_idx" ON "WebhookDelivery"("organizationId","createdAt");
CREATE INDEX "WebhookDelivery_status_lastAttemptAt_idx" ON "WebhookDelivery"("status","lastAttemptAt");
ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_webhookId_fkey"
  FOREIGN KEY ("webhookId") REFERENCES "TenantWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- PublicApiKey ------------------------------------------------------
CREATE TABLE "PublicApiKey" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "keyHash"        TEXT NOT NULL,
  "prefix"         TEXT NOT NULL,
  "scopes"         TEXT[] DEFAULT ARRAY['read']::TEXT[],
  "lastUsedAt"     TIMESTAMP(3),
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"      TIMESTAMP(3),
  CONSTRAINT "PublicApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublicApiKey_keyHash_key" ON "PublicApiKey"("keyHash");
CREATE INDEX "PublicApiKey_organizationId_revokedAt_idx" ON "PublicApiKey"("organizationId","revokedAt");
CREATE INDEX "PublicApiKey_prefix_idx" ON "PublicApiKey"("prefix");
ALTER TABLE "PublicApiKey"
  ADD CONSTRAINT "PublicApiKey_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicApiKey"
  ADD CONSTRAINT "PublicApiKey_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
