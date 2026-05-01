-- CreateEnum
CREATE TYPE "VapiNumberStatus" AS ENUM ('ACTIVE', 'RELEASED', 'POOL');

-- DropForeignKey
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_organizationId_fkey";

-- DropTable
DROP TABLE "ApiKey";

-- CreateTable
CREATE TABLE "OrgVapiNumber" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vapiPhoneNumberId" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'vapi',
    "status" "VapiNumberStatus" NOT NULL DEFAULT 'POOL',
    "monthlyCostCents" INTEGER NOT NULL,
    "provisionedAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "spamScore" DOUBLE PRECISION,
    "lastRotatedAt" TIMESTAMP(3),
    "areaCode" TEXT,

    CONSTRAINT "OrgVapiNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendCap" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dailyCapCents" INTEGER NOT NULL,
    "monthlyCapCents" INTEGER NOT NULL,
    "currentDayCents" INTEGER NOT NULL DEFAULT 0,
    "currentMonthCents" INTEGER NOT NULL DEFAULT 0,
    "lastDayResetAt" TIMESTAMP(3) NOT NULL,
    "lastMonthResetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendCap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DncEntry" (
    "id" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DncEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyAccessLog" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "keyName" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,

    CONSTRAINT "KeyAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgVapiNumber_organizationId_key" ON "OrgVapiNumber"("organizationId");

-- CreateIndex
CREATE INDEX "OrgVapiNumber_status_idx" ON "OrgVapiNumber"("status");

-- CreateIndex
CREATE INDEX "OrgVapiNumber_areaCode_idx" ON "OrgVapiNumber"("areaCode");

-- CreateIndex
CREATE UNIQUE INDEX "SpendCap_organizationId_key" ON "SpendCap"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DncEntry_phoneE164_key" ON "DncEntry"("phoneE164");

-- CreateIndex
CREATE INDEX "DncEntry_source_idx" ON "DncEntry"("source");

-- CreateIndex
CREATE INDEX "DncEntry_expiresAt_idx" ON "DncEntry"("expiresAt");

-- CreateIndex
CREATE INDEX "KeyAccessLog_service_fetchedAt_idx" ON "KeyAccessLog"("service", "fetchedAt");

-- AddForeignKey
ALTER TABLE "OrgVapiNumber" ADD CONSTRAINT "OrgVapiNumber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendCap" ADD CONSTRAINT "SpendCap_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

