-- CreateTable
CREATE TABLE "PlatformSecret" (
    "key" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSecret_pkey" PRIMARY KEY ("key")
);
