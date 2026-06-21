-- CreateEnum
CREATE TYPE "ingest"."GenealogyTreeType" AS ENUM ('sponsor', 'binary');

-- CreateEnum
CREATE TYPE "ingest"."GenealogyLeg" AS ENUM ('left', 'right', 'sponsor', 'unknown');

-- CreateTable
CREATE TABLE "ingest"."GenealogyNode" (
    "id" TEXT NOT NULL,
    "bpCode" TEXT NOT NULL,
    "bpName" TEXT,
    "uid" TEXT,
    "treeType" "ingest"."GenealogyTreeType" NOT NULL,
    "modalData" JSONB NOT NULL DEFAULT '{}',
    "childrenJson" JSONB NOT NULL DEFAULT '[]',
    "scrapeRunId" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenealogyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest"."GenealogyEdge" (
    "id" TEXT NOT NULL,
    "parentBpCode" TEXT NOT NULL,
    "childBpCode" TEXT NOT NULL,
    "treeType" "ingest"."GenealogyTreeType" NOT NULL,
    "leg" "ingest"."GenealogyLeg" NOT NULL DEFAULT 'unknown',
    "scrapeRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenealogyEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GenealogyNode_bpCode_treeType_key" ON "ingest"."GenealogyNode"("bpCode", "treeType");

-- CreateIndex
CREATE INDEX "GenealogyNode_treeType_idx" ON "ingest"."GenealogyNode"("treeType");

-- CreateIndex
CREATE INDEX "GenealogyNode_scrapeRunId_idx" ON "ingest"."GenealogyNode"("scrapeRunId");

-- CreateIndex
CREATE UNIQUE INDEX "GenealogyEdge_parentBpCode_childBpCode_treeType_key" ON "ingest"."GenealogyEdge"("parentBpCode", "childBpCode", "treeType");

-- CreateIndex
CREATE INDEX "GenealogyEdge_childBpCode_treeType_idx" ON "ingest"."GenealogyEdge"("childBpCode", "treeType");

-- CreateIndex
CREATE INDEX "GenealogyEdge_parentBpCode_treeType_idx" ON "ingest"."GenealogyEdge"("parentBpCode", "treeType");
