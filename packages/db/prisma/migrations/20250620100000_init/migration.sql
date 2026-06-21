-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ingest";
CREATE SCHEMA IF NOT EXISTS "system";

-- CreateEnum
CREATE TYPE "ingest"."ScrapeRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'partial', 'cancelled');
CREATE TYPE "ingest"."Portal" AS ENUM ('admin', 'bp');
CREATE TYPE "ingest"."BpSessionSource" AS ENUM ('panel', 'direct_login');

-- CreateTable
CREATE TABLE "ingest"."ScrapeRun" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "portal" "ingest"."Portal" NOT NULL,
    "bpCode" TEXT,
    "status" "ingest"."ScrapeRunStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "rowsInserted" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingest"."RawModuleRow" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "portal" "ingest"."Portal" NOT NULL,
    "bpCode" TEXT,
    "rowJson" JSONB NOT NULL,
    "rowHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrapeRunId" TEXT NOT NULL,
    CONSTRAINT "RawModuleRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingest"."BpSession" (
    "id" TEXT NOT NULL,
    "bpCode" TEXT NOT NULL,
    "bpName" TEXT,
    "storageStatePath" TEXT NOT NULL,
    "lastValidatedAt" TIMESTAMP(3),
    "source" "ingest"."BpSessionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BpSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system"."ModuleSchedule" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModuleSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingest"."ScrapeFailure" (
    "id" TEXT NOT NULL,
    "scrapeRunId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "url" TEXT,
    "error" TEXT NOT NULL,
    "htmlPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrapeFailure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingest"."BackfillProgress" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "portal" "ingest"."Portal" NOT NULL,
    "bpCode" TEXT,
    "dateFrom" TEXT,
    "dateTo" TEXT,
    "currentCursor" TEXT,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "completedChunks" INTEGER NOT NULL DEFAULT 0,
    "status" "ingest"."ScrapeRunStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BackfillProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawModuleRow_rowHash_key" ON "ingest"."RawModuleRow"("rowHash");
CREATE UNIQUE INDEX "BpSession_bpCode_key" ON "ingest"."BpSession"("bpCode");
CREATE UNIQUE INDEX "ModuleSchedule_moduleKey_key" ON "system"."ModuleSchedule"("moduleKey");
CREATE UNIQUE INDEX "BackfillProgress_moduleKey_portal_bpCode_key" ON "ingest"."BackfillProgress"("moduleKey", "portal", "bpCode");
CREATE INDEX "ScrapeRun_moduleKey_portal_idx" ON "ingest"."ScrapeRun"("moduleKey", "portal");
CREATE INDEX "ScrapeRun_status_idx" ON "ingest"."ScrapeRun"("status");
CREATE INDEX "ScrapeRun_createdAt_idx" ON "ingest"."ScrapeRun"("createdAt");
CREATE INDEX "RawModuleRow_moduleKey_portal_idx" ON "ingest"."RawModuleRow"("moduleKey", "portal");
CREATE INDEX "RawModuleRow_moduleKey_bpCode_idx" ON "ingest"."RawModuleRow"("moduleKey", "bpCode");
CREATE INDEX "RawModuleRow_lastSeenAt_idx" ON "ingest"."RawModuleRow"("lastSeenAt");
CREATE INDEX "ScrapeFailure_scrapeRunId_idx" ON "ingest"."ScrapeFailure"("scrapeRunId");

-- AddForeignKey
ALTER TABLE "ingest"."RawModuleRow" ADD CONSTRAINT "RawModuleRow_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ingest"."ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingest"."ScrapeFailure" ADD CONSTRAINT "ScrapeFailure_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ingest"."ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
