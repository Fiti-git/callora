-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN "vapiCallId" TEXT,
ADD COLUMN "cost" DOUBLE PRECISION,
ADD COLUMN "costBreakdown" JSONB;
