-- Phase 1, Agent 5 — EmailLog: persistent record of every outbound email.
--
-- Until the Resend webhooks land in Phase 2, this is a synchronous write from
-- inside `sendEmail`. status is SENT on success, FAILED on transport error.
-- providerMessageId is the Resend id when available so we can later reconcile
-- delivery events against this row.
--
-- organizationId is nullable because some emails (e.g. password reset, verify)
-- happen before the user is fully linked to an org for ergonomic logging.

CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLog_organizationId_createdAt_idx" ON "EmailLog"("organizationId", "createdAt");
CREATE INDEX "EmailLog_recipient_idx" ON "EmailLog"("recipient");
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");
