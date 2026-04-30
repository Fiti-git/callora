-- Phase 3 Agent 10 — Email Marketing.
-- Adds: EmailCampaign, EmailRecipientList, EmailCampaignList,
-- EmailRecipientListMember, EmailSend, EmailTemplate, EmailAutomation,
-- EmailAutomationRun + four enums.

-- ----- Enums -------------------------------------------------------------
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT','SCHEDULED','SENDING','SENT','PAUSED','FAILED');
CREATE TYPE "EmailSendStatus" AS ENUM ('QUEUED','SENT','DELIVERED','OPENED','CLICKED','BOUNCED','COMPLAINED','UNSUBSCRIBED','FAILED');
CREATE TYPE "EmailRecipientSource" AS ENUM ('MANUAL','CSV_IMPORT','CAMPAIGN','API');
CREATE TYPE "EmailAutomationTrigger" AS ENUM ('LEAD_QUALIFIED','DEAL_WON','CONTACT_CREATED','CAMPAIGN_COMPLETE');

-- ----- EmailCampaign -----------------------------------------------------
CREATE TABLE "EmailCampaign" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "subject"           TEXT NOT NULL,
  "previewText"       TEXT,
  "htmlBody"          TEXT NOT NULL,
  "textBody"          TEXT,
  "status"            "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt"       TIMESTAMP(3),
  "sentAt"            TIMESTAMP(3),
  "fromName"          TEXT NOT NULL,
  "fromEmail"         TEXT NOT NULL,
  "replyTo"           TEXT,
  "totalRecipients"   INTEGER NOT NULL DEFAULT 0,
  "totalSent"         INTEGER NOT NULL DEFAULT 0,
  "totalDelivered"    INTEGER NOT NULL DEFAULT 0,
  "totalOpened"       INTEGER NOT NULL DEFAULT 0,
  "totalClicked"      INTEGER NOT NULL DEFAULT 0,
  "totalBounced"      INTEGER NOT NULL DEFAULT 0,
  "totalUnsubscribed" INTEGER NOT NULL DEFAULT 0,
  "totalComplained"   INTEGER NOT NULL DEFAULT 0,
  "createdById"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailCampaign_organizationId_status_idx" ON "EmailCampaign"("organizationId","status");
CREATE INDEX "EmailCampaign_deletedAt_idx" ON "EmailCampaign"("deletedAt");
ALTER TABLE "EmailCampaign"
  ADD CONSTRAINT "EmailCampaign_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailCampaign"
  ADD CONSTRAINT "EmailCampaign_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----- EmailRecipientList ------------------------------------------------
CREATE TABLE "EmailRecipientList" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "memberCount"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "EmailRecipientList_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailRecipientList_organizationId_idx" ON "EmailRecipientList"("organizationId");
CREATE INDEX "EmailRecipientList_deletedAt_idx" ON "EmailRecipientList"("deletedAt");
ALTER TABLE "EmailRecipientList"
  ADD CONSTRAINT "EmailRecipientList_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- EmailCampaignList (join) ------------------------------------------
CREATE TABLE "EmailCampaignList" (
  "campaignId" TEXT NOT NULL,
  "listId"     TEXT NOT NULL,
  CONSTRAINT "EmailCampaignList_pkey" PRIMARY KEY ("campaignId","listId")
);
ALTER TABLE "EmailCampaignList"
  ADD CONSTRAINT "EmailCampaignList_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailCampaignList"
  ADD CONSTRAINT "EmailCampaignList_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "EmailRecipientList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- EmailRecipientListMember ------------------------------------------
CREATE TABLE "EmailRecipientListMember" (
  "id"             TEXT NOT NULL,
  "listId"         TEXT NOT NULL,
  "contactId"      TEXT,
  "email"          TEXT NOT NULL,
  "source"         "EmailRecipientSource" NOT NULL,
  "subscribedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unsubscribedAt" TIMESTAMP(3),
  CONSTRAINT "EmailRecipientListMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailRecipientListMember_listId_email_key" ON "EmailRecipientListMember"("listId","email");
CREATE INDEX "EmailRecipientListMember_listId_unsubscribedAt_idx" ON "EmailRecipientListMember"("listId","unsubscribedAt");
CREATE INDEX "EmailRecipientListMember_email_idx" ON "EmailRecipientListMember"("email");
ALTER TABLE "EmailRecipientListMember"
  ADD CONSTRAINT "EmailRecipientListMember_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "EmailRecipientList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailRecipientListMember"
  ADD CONSTRAINT "EmailRecipientListMember_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----- EmailSend ---------------------------------------------------------
CREATE TABLE "EmailSend" (
  "id"                TEXT NOT NULL,
  "campaignId"        TEXT NOT NULL,
  "contactId"         TEXT,
  "organizationId"    TEXT NOT NULL,
  "email"             TEXT NOT NULL,
  "status"            "EmailSendStatus" NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" TEXT,
  "sentAt"            TIMESTAMP(3),
  "deliveredAt"       TIMESTAMP(3),
  "openedAt"          TIMESTAMP(3),
  "clickedAt"         TIMESTAMP(3),
  "bouncedAt"         TIMESTAMP(3),
  "complainedAt"      TIMESTAMP(3),
  "unsubscribedAt"    TIMESTAMP(3),
  "failedAt"          TIMESTAMP(3),
  "errorMessage"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailSend_providerMessageId_key" ON "EmailSend"("providerMessageId");
CREATE INDEX "EmailSend_campaignId_status_idx" ON "EmailSend"("campaignId","status");
CREATE INDEX "EmailSend_organizationId_status_createdAt_idx" ON "EmailSend"("organizationId","status","createdAt");
CREATE INDEX "EmailSend_providerMessageId_idx" ON "EmailSend"("providerMessageId");
ALTER TABLE "EmailSend"
  ADD CONSTRAINT "EmailSend_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSend"
  ADD CONSTRAINT "EmailSend_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSend"
  ADD CONSTRAINT "EmailSend_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----- EmailTemplate -----------------------------------------------------
CREATE TABLE "EmailTemplate" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "subject"        TEXT NOT NULL,
  "htmlBody"       TEXT NOT NULL,
  "textBody"       TEXT,
  "category"       TEXT,
  "isDefault"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailTemplate_organizationId_category_idx" ON "EmailTemplate"("organizationId","category");
CREATE INDEX "EmailTemplate_deletedAt_idx" ON "EmailTemplate"("deletedAt");
ALTER TABLE "EmailTemplate"
  ADD CONSTRAINT "EmailTemplate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- EmailAutomation ---------------------------------------------------
CREATE TABLE "EmailAutomation" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "trigger"        "EmailAutomationTrigger" NOT NULL,
  "active"         BOOLEAN NOT NULL DEFAULT false,
  "sequence"       JSONB NOT NULL,
  "stats"          JSONB NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "EmailAutomation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailAutomation_organizationId_active_idx" ON "EmailAutomation"("organizationId","active");
CREATE INDEX "EmailAutomation_deletedAt_idx" ON "EmailAutomation"("deletedAt");
ALTER TABLE "EmailAutomation"
  ADD CONSTRAINT "EmailAutomation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----- EmailAutomationRun ------------------------------------------------
CREATE TABLE "EmailAutomationRun" (
  "id"             TEXT NOT NULL,
  "automationId"   TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "contactId"      TEXT,
  "triggeredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentStep"    INTEGER NOT NULL DEFAULT 0,
  "status"         TEXT NOT NULL,
  "context"        JSONB NOT NULL,
  CONSTRAINT "EmailAutomationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailAutomationRun_automationId_status_idx" ON "EmailAutomationRun"("automationId","status");
CREATE INDEX "EmailAutomationRun_organizationId_triggeredAt_idx" ON "EmailAutomationRun"("organizationId","triggeredAt");
ALTER TABLE "EmailAutomationRun"
  ADD CONSTRAINT "EmailAutomationRun_automationId_fkey"
  FOREIGN KEY ("automationId") REFERENCES "EmailAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAutomationRun"
  ADD CONSTRAINT "EmailAutomationRun_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAutomationRun"
  ADD CONSTRAINT "EmailAutomationRun_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----- Seed default email quotas (data only; non-destructive) -----------
UPDATE "Plan" SET "maxEmailsPerMonth" = 500    WHERE "tier" = 'FREE'       AND "maxEmailsPerMonth" IS NULL;
UPDATE "Plan" SET "maxEmailsPerMonth" = 2500   WHERE "tier" = 'STARTER'    AND "maxEmailsPerMonth" IS NULL;
UPDATE "Plan" SET "maxEmailsPerMonth" = 10000  WHERE "tier" = 'PRO'        AND "maxEmailsPerMonth" IS NULL;
-- ENTERPRISE intentionally left NULL = unlimited.
