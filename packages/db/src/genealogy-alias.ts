import { Prisma } from '@prisma/client';
import { getPrisma } from './client.js';

export interface GenealogyAliasMigrationResult {
  mismatchesFound: number;
  nodesUpdated: number;
  edgesUpdated: number;
}

/** Portal tree code stored on nodes when it differs from bp_list BP ID. */
export async function findGenealogyAliasForListBp(
  listBpCode: string,
  uid?: string,
): Promise<string | null> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ stored_bp: string }>>(Prisma.sql`
    SELECT n."bpCode" AS stored_bp
    FROM ingest."ScrapeRun" sr
    JOIN ingest."GenealogyNode" n ON n."scrapeRunId" = sr.id
    WHERE sr."moduleKey" = 'genealogy_bp'
      AND sr.status = 'completed'
      AND LOWER(sr.metadata->>'bpCode') = LOWER(${listBpCode})
      AND LOWER(n."bpCode") <> LOWER(${listBpCode})
      ${uid ? Prisma.sql`AND sr.metadata->>'uid' = ${uid}` : Prisma.empty}
    ORDER BY sr."finishedAt" DESC
    LIMIT 1
  `);
  return rows[0]?.stored_bp ?? null;
}

/** Resolve the bpCode used in GenealogyNode/GenealogyEdge for API lookups. */
export async function resolveGenealogyLookupCode(
  requestedBpCode: string,
  uid?: string,
): Promise<string> {
  const prisma = getPrisma();
  if (uid) {
    const node = await prisma.genealogyNode.findFirst({
      where: { uid },
      select: { bpCode: true },
      orderBy: { scrapedAt: 'desc' },
    });
    if (node) return node.bpCode;
  }

  const direct = await prisma.genealogyNode.count({
    where: {
      bpCode: { equals: requestedBpCode, mode: 'insensitive' },
      ...(uid ? { uid } : {}),
    },
  });
  if (direct > 0) return requestedBpCode;

  const alias = await findGenealogyAliasForListBp(requestedBpCode, uid);
  return alias ?? requestedBpCode;
}

/**
 * Rename genealogy nodes/edges stored under portal alias codes to bp_list BP IDs.
 * Safe to run multiple times (idempotent for already-fixed rows).
 */
export async function migrateGenealogyBpAliases(): Promise<GenealogyAliasMigrationResult> {
  const prisma = getPrisma();

  const mismatches = await prisma.$queryRaw<
    Array<{ list_bp: string; run_id: string; stored_bp: string }>
  >(Prisma.sql`
    WITH latest_runs AS (
      SELECT DISTINCT ON (LOWER(metadata->>'bpCode'))
        metadata->>'bpCode' AS list_bp,
        id AS run_id
      FROM ingest."ScrapeRun"
      WHERE "moduleKey" = 'genealogy_bp'
        AND status = 'completed'
        AND COALESCE(metadata->>'bpCode', '') <> ''
      ORDER BY LOWER(metadata->>'bpCode'), "finishedAt" DESC
    ),
    alias_rows AS (
      SELECT lr.list_bp, lr.run_id, n."bpCode" AS stored_bp
      FROM latest_runs lr
      JOIN ingest."GenealogyNode" n ON n."scrapeRunId" = lr.run_id
      WHERE NOT EXISTS (
        SELECT 1 FROM ingest."GenealogyNode" g
        WHERE LOWER(g."bpCode") = LOWER(lr.list_bp)
      )
      AND LOWER(n."bpCode") <> LOWER(lr.list_bp)
      GROUP BY lr.list_bp, lr.run_id, n."bpCode"
    )
    SELECT list_bp, run_id, stored_bp FROM alias_rows
  `);

  let nodesUpdated = 0;
  let edgesUpdated = 0;

  for (const row of mismatches) {
    const nodeResult = await prisma.$executeRaw(Prisma.sql`
      UPDATE ingest."GenealogyNode"
      SET "bpCode" = ${row.list_bp}, "updatedAt" = NOW()
      WHERE "scrapeRunId" = ${row.run_id}
        AND "bpCode" = ${row.stored_bp}
        AND NOT EXISTS (
          SELECT 1 FROM ingest."GenealogyNode" existing
          WHERE LOWER(existing."bpCode") = LOWER(${row.list_bp})
            AND existing."treeType" = ingest."GenealogyNode"."treeType"
            AND existing.id <> ingest."GenealogyNode".id
        )
    `);
    nodesUpdated += Number(nodeResult);

    const edgeResult = await prisma.$executeRaw(Prisma.sql`
      UPDATE ingest."GenealogyEdge"
      SET "parentBpCode" = ${row.list_bp}
      WHERE "scrapeRunId" = ${row.run_id}
        AND "parentBpCode" = ${row.stored_bp}
    `);
    edgesUpdated += Number(edgeResult);
  }

  return {
    mismatchesFound: mismatches.length,
    nodesUpdated,
    edgesUpdated,
  };
}
