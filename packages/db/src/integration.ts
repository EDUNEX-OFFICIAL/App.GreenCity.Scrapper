import { Prisma } from '@prisma/client';
import { getPrisma } from './client.js';

export interface DistinctModuleRowQuery {
  moduleKey: string;
  distinctKey: string;
  /** When set, partition/count by composite key (e.g. UID + BP ID). */
  distinctKeys?: string[];
  page: number;
  limit: number;
  updatedAfter?: Date;
  search?: string;
  searchKeys?: string[];
  uid?: string;
  portal?: 'admin' | 'bp';
}

export interface DistinctModuleRow {
  id: string;
  rowJson: Record<string, string>;
  lastSeenAt: Date;
  firstSeenAt: Date;
}

export interface RawModuleRowRecord {
  id: string;
  moduleKey: string;
  rowJson: Record<string, string>;
  lastSeenAt: Date;
  firstSeenAt: Date;
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

function buildDistinctWhere(
  moduleKey: string,
  distinctKey: string,
  opts: {
    updatedAfter?: Date;
    search?: string;
    searchKeys?: string[];
    uid?: string;
    portal?: string;
    distinctKeys?: string[];
  },
): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`"moduleKey" = ${moduleKey}`,
    Prisma.sql`"scrapeStatus" = 'ok'`,
  ];
  if (opts.portal) parts.push(Prisma.sql`"portal" = ${opts.portal}::"ingest"."Portal"`);
  if (opts.updatedAfter) parts.push(Prisma.sql`"lastSeenAt" >= ${opts.updatedAfter}`);
  if (opts.uid) parts.push(Prisma.sql`"rowJson"->>'UID' = ${opts.uid}`);
  if (opts.search && opts.searchKeys?.length) {
    const pattern = `%${escapeLike(opts.search)}%`;
    const searchParts = opts.searchKeys.map(
      (key) => Prisma.sql`"rowJson"->>${key} ILIKE ${pattern}`,
    );
    parts.push(Prisma.sql`(${Prisma.join(searchParts, ' OR ')})`);
  }
  const keys = opts.distinctKeys?.length ? opts.distinctKeys : [distinctKey];
  for (const key of keys) {
    parts.push(Prisma.sql`COALESCE("rowJson"->>${key}, '') <> ''`);
  }
  return Prisma.join(parts, ' AND ');
}

function buildPartitionClause(distinctKey: string, distinctKeys?: string[]): Prisma.Sql {
  if (distinctKeys?.length) {
    const parts = distinctKeys.map((key) => Prisma.sql`"rowJson"->>${key}`);
    return Prisma.sql`(${Prisma.join(parts, ', ')})`;
  }
  return Prisma.sql`"rowJson"->>${distinctKey}`;
}

export async function queryDistinctModuleRows(
  query: DistinctModuleRowQuery,
): Promise<DistinctModuleRow[]> {
  const prisma = getPrisma();
  const offset = (query.page - 1) * query.limit;
  const where = buildDistinctWhere(query.moduleKey, query.distinctKey, {
    updatedAfter: query.updatedAfter,
    search: query.search,
    searchKeys: query.searchKeys,
    uid: query.uid,
    portal: query.portal ?? 'admin',
    distinctKeys: query.distinctKeys,
  });
  const partition = buildPartitionClause(query.distinctKey, query.distinctKeys);

  // ROW_NUMBER avoids Prisma binding distinctKey twice ($1 vs $2), which breaks
  // PostgreSQL DISTINCT ON ("rowJson"->>$1) ... ORDER BY "rowJson"->>$2 ...
  const rows = await prisma.$queryRaw<
    Array<{ id: string; rowJson: unknown; lastSeenAt: Date; firstSeenAt: Date }>
  >(Prisma.sql`
    SELECT "id", "rowJson", "lastSeenAt", "firstSeenAt"
    FROM (
      SELECT
        "id",
        "rowJson",
        "lastSeenAt",
        "firstSeenAt",
        ROW_NUMBER() OVER (
          PARTITION BY ${partition}
          ORDER BY "lastSeenAt" DESC
        ) AS rn
      FROM "ingest"."RawModuleRow"
      WHERE ${where}
    ) AS ranked_rows
    WHERE rn = 1
    ORDER BY "lastSeenAt" DESC
    LIMIT ${query.limit} OFFSET ${offset}
  `);

  return rows.map((r) => ({
    id: r.id,
    rowJson: r.rowJson as Record<string, string>,
    lastSeenAt: r.lastSeenAt,
    firstSeenAt: r.firstSeenAt,
  }));
}

export async function countDistinctModuleRows(
  query: Omit<DistinctModuleRowQuery, 'page' | 'limit'>,
): Promise<number> {
  const prisma = getPrisma();
  const where = buildDistinctWhere(query.moduleKey, query.distinctKey, {
    updatedAfter: query.updatedAfter,
    search: query.search,
    searchKeys: query.searchKeys,
    uid: query.uid,
    portal: query.portal ?? 'admin',
    distinctKeys: query.distinctKeys,
  });
  const partition = buildPartitionClause(query.distinctKey, query.distinctKeys);

  const result = await prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM (
      SELECT ${partition}
      FROM "ingest"."RawModuleRow"
      WHERE ${where}
      GROUP BY ${partition}
    ) AS distinct_groups
  `);
  return Number(result[0]?.count ?? 0);
}

const SALE_DEPOSIT_ID_SQL = Prisma.sql`substring("rowJson"->>'Receipt_href' from 'depositid=([0-9]+)')`;

function buildSaleTransactionDistinctWhere(opts: { updatedAfter?: Date; portal?: string }): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`"moduleKey" = 'sale_transactions'`,
    Prisma.sql`"scrapeStatus" = 'ok'`,
    Prisma.sql`${SALE_DEPOSIT_ID_SQL} IS NOT NULL`,
    Prisma.sql`${SALE_DEPOSIT_ID_SQL} <> ''`,
  ];
  if (opts.portal) parts.push(Prisma.sql`"portal" = ${opts.portal}::"ingest"."Portal"`);
  if (opts.updatedAfter) parts.push(Prisma.sql`"lastSeenAt" >= ${opts.updatedAfter}`);
  return Prisma.join(parts, ' AND ');
}

/** Distinct sale deposits by depositid parsed from Receipt_href. */
export async function queryDistinctSaleTransactions(params: {
  page: number;
  limit: number;
  updatedAfter?: Date;
  portal?: 'admin' | 'bp';
}): Promise<DistinctModuleRow[]> {
  const prisma = getPrisma();
  const offset = (params.page - 1) * params.limit;
  const where = buildSaleTransactionDistinctWhere({
    updatedAfter: params.updatedAfter,
    portal: params.portal ?? 'admin',
  });

  const rows = await prisma.$queryRaw<
    Array<{ id: string; rowJson: unknown; lastSeenAt: Date; firstSeenAt: Date }>
  >(Prisma.sql`
    SELECT "id", "rowJson", "lastSeenAt", "firstSeenAt"
    FROM (
      SELECT
        "id",
        "rowJson",
        "lastSeenAt",
        "firstSeenAt",
        ROW_NUMBER() OVER (
          PARTITION BY ${SALE_DEPOSIT_ID_SQL}
          ORDER BY "lastSeenAt" DESC
        ) AS rn
      FROM "ingest"."RawModuleRow"
      WHERE ${where}
    ) AS ranked_rows
    WHERE rn = 1
    ORDER BY "lastSeenAt" DESC
    LIMIT ${params.limit} OFFSET ${offset}
  `);

  return rows.map((r) => ({
    id: r.id,
    rowJson: r.rowJson as Record<string, string>,
    lastSeenAt: r.lastSeenAt,
    firstSeenAt: r.firstSeenAt,
  }));
}

export async function countDistinctSaleTransactions(params: {
  updatedAfter?: Date;
  portal?: 'admin' | 'bp';
}): Promise<number> {
  const prisma = getPrisma();
  const where = buildSaleTransactionDistinctWhere({
    updatedAfter: params.updatedAfter,
    portal: params.portal ?? 'admin',
  });

  const result = await prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
    SELECT COUNT(DISTINCT ${SALE_DEPOSIT_ID_SQL})::bigint AS count
    FROM "ingest"."RawModuleRow"
    WHERE ${where}
  `);
  return Number(result[0]?.count ?? 0);
}

export async function queryModuleRows(params: {
  moduleKey: string;
  page: number;
  limit: number;
  updatedAfter?: Date;
  portal?: 'admin' | 'bp';
}): Promise<RawModuleRowRecord[]> {
  const prisma = getPrisma();
  const rows = await prisma.rawModuleRow.findMany({
    where: {
      moduleKey: params.moduleKey,
      portal: params.portal ?? 'admin',
      scrapeStatus: 'ok',
      ...(params.updatedAfter ? { lastSeenAt: { gte: params.updatedAfter } } : {}),
    },
    select: {
      id: true,
      moduleKey: true,
      rowJson: true,
      lastSeenAt: true,
      firstSeenAt: true,
    },
    orderBy: { lastSeenAt: 'desc' },
    skip: (params.page - 1) * params.limit,
    take: params.limit,
  });
  return rows.map((r) => ({
    id: r.id,
    moduleKey: r.moduleKey,
    rowJson: r.rowJson as Record<string, string>,
    lastSeenAt: r.lastSeenAt,
    firstSeenAt: r.firstSeenAt,
  }));
}

export async function countModuleRows(params: {
  moduleKey: string;
  updatedAfter?: Date;
  portal?: 'admin' | 'bp';
}): Promise<number> {
  const prisma = getPrisma();
  return prisma.rawModuleRow.count({
    where: {
      moduleKey: params.moduleKey,
      portal: params.portal ?? 'admin',
      scrapeStatus: 'ok',
      ...(params.updatedAfter ? { lastSeenAt: { gte: params.updatedAfter } } : {}),
    },
  });
}

const FETCH_ALL_BATCH = 5000;
const FETCH_ALL_MAX = 100_000;

/** Fetch all module rows in batches (for in-memory filter/merge endpoints). */
export async function fetchAllModuleRows(params: {
  moduleKey: string;
  updatedAfter?: Date;
  portal?: 'admin' | 'bp';
  maxRows?: number;
}): Promise<RawModuleRowRecord[]> {
  const maxRows = params.maxRows ?? FETCH_ALL_MAX;
  const all: RawModuleRowRecord[] = [];
  let page = 1;

  while (all.length < maxRows) {
    const batch = await queryModuleRows({
      moduleKey: params.moduleKey,
      page,
      limit: FETCH_ALL_BATCH,
      updatedAfter: params.updatedAfter,
      portal: params.portal,
    });
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < FETCH_ALL_BATCH) break;
    page += 1;
  }

  return all.slice(0, maxRows);
}

function mapRawModuleRow(row: {
  id: string;
  moduleKey: string;
  rowJson: unknown;
  lastSeenAt: Date;
  firstSeenAt: Date;
}): RawModuleRowRecord {
  return {
    id: row.id,
    moduleKey: row.moduleKey,
    rowJson: row.rowJson as Record<string, string>,
    lastSeenAt: row.lastSeenAt,
    firstSeenAt: row.firstSeenAt,
  };
}

/** Latest row per (UID, BP ID) for a given BP code (case-insensitive). */
export async function getBpRowsByCode(bpCode: string): Promise<RawModuleRowRecord[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<
    Array<{ id: string; moduleKey: string; rowJson: unknown; lastSeenAt: Date; firstSeenAt: Date }>
  >(Prisma.sql`
    SELECT "id", "moduleKey", "rowJson", "lastSeenAt", "firstSeenAt"
    FROM (
      SELECT
        "id",
        "moduleKey",
        "rowJson",
        "lastSeenAt",
        "firstSeenAt",
        ROW_NUMBER() OVER (
          PARTITION BY "rowJson"->>'UID', "rowJson"->>'BP ID'
          ORDER BY "lastSeenAt" DESC
        ) AS rn
      FROM "ingest"."RawModuleRow"
      WHERE "moduleKey" = 'bp_list'
        AND "portal" = 'admin'::"ingest"."Portal"
        AND "scrapeStatus" = 'ok'
        AND LOWER("rowJson"->>'BP ID') = LOWER(${bpCode})
        AND COALESCE("rowJson"->>'UID', '') <> ''
        AND COALESCE("rowJson"->>'BP ID', '') <> ''
    ) AS ranked_rows
    WHERE rn = 1
    ORDER BY ("rowJson"->>'UID')::int ASC NULLS LAST
  `);
  return rows.map(mapRawModuleRow);
}

export async function getBpByUid(uid: string): Promise<RawModuleRowRecord | null> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<
    Array<{ id: string; moduleKey: string; rowJson: unknown; lastSeenAt: Date; firstSeenAt: Date }>
  >(Prisma.sql`
    SELECT "id", "moduleKey", "rowJson", "lastSeenAt", "firstSeenAt"
    FROM "ingest"."RawModuleRow"
    WHERE "moduleKey" = 'bp_list'
      AND "portal" = 'admin'::"ingest"."Portal"
      AND "scrapeStatus" = 'ok'
      AND "rowJson"->>'UID' = ${uid}
    ORDER BY "lastSeenAt" DESC
    LIMIT 1
  `);
  const row = rows[0];
  return row ? mapRawModuleRow(row) : null;
}

export async function getBpByCodeAndUid(
  bpCode: string,
  uid: string,
): Promise<RawModuleRowRecord | null> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<
    Array<{ id: string; moduleKey: string; rowJson: unknown; lastSeenAt: Date; firstSeenAt: Date }>
  >(Prisma.sql`
    SELECT "id", "moduleKey", "rowJson", "lastSeenAt", "firstSeenAt"
    FROM "ingest"."RawModuleRow"
    WHERE "moduleKey" = 'bp_list'
      AND "portal" = 'admin'::"ingest"."Portal"
      AND "scrapeStatus" = 'ok'
      AND LOWER("rowJson"->>'BP ID') = LOWER(${bpCode})
      AND "rowJson"->>'UID' = ${uid}
    ORDER BY "lastSeenAt" DESC
    LIMIT 1
  `);
  const row = rows[0];
  return row ? mapRawModuleRow(row) : null;
}

export async function getLatestRowByKey(params: {
  moduleKey: string;
  keyField: string;
  keyValue: string;
  portal?: 'admin' | 'bp';
}): Promise<RawModuleRowRecord | null> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<
    Array<{ id: string; moduleKey: string; rowJson: unknown; lastSeenAt: Date; firstSeenAt: Date }>
  >(Prisma.sql`
    SELECT "id", "moduleKey", "rowJson", "lastSeenAt", "firstSeenAt"
    FROM "ingest"."RawModuleRow"
    WHERE "moduleKey" = ${params.moduleKey}
      AND "portal" = ${params.portal ?? 'admin'}::"ingest"."Portal"
      AND "scrapeStatus" = 'ok'
      AND LOWER("rowJson"->>${params.keyField}) = LOWER(${params.keyValue})
    ORDER BY "lastSeenAt" DESC
    LIMIT 1
  `);
  const row = rows[0];
  return row ? mapRawModuleRow(row) : null;
}

export async function getGenealogyNodesForBp(bpCode: string, uid?: string) {
  const prisma = getPrisma();
  return prisma.genealogyNode.findMany({
    where: {
      bpCode: { equals: bpCode, mode: 'insensitive' },
      ...(uid ? { uid } : {}),
    },
    select: {
      bpCode: true,
      bpName: true,
      uid: true,
      treeType: true,
      modalData: true,
      childrenJson: true,
      updatedAt: true,
      scrapedAt: true,
    },
  });
}

export async function getGenealogyNodesForUid(uid: string) {
  const prisma = getPrisma();
  return prisma.genealogyNode.findMany({
    where: { uid },
    select: {
      bpCode: true,
      bpName: true,
      uid: true,
      treeType: true,
      modalData: true,
      childrenJson: true,
      updatedAt: true,
      scrapedAt: true,
    },
  });
}

export async function countBpRowsByCode(bpCode: string): Promise<number> {
  const rows = await getBpRowsByCode(bpCode);
  return rows.length;
}

export async function getGenealogyEdgesForBp(bpCode: string, treeType: 'sponsor' | 'binary') {
  return getGenealogySubtreeEdges(bpCode, treeType);
}

/** BFS-collect all edges in the downline subtree from root BP. */
export async function getGenealogySubtreeEdges(
  bpCode: string,
  treeType: 'sponsor' | 'binary',
) {
  const prisma = getPrisma();
  const seenBp = new Set<string>([bpCode.toLowerCase()]);
  const seenEdge = new Set<string>();
  const allEdges: Array<{
    parentBpCode: string;
    childBpCode: string;
    treeType: typeof treeType;
    leg: string;
    updatedAt: Date;
  }> = [];
  let frontier = [bpCode];

  while (frontier.length > 0) {
    const edges = await prisma.genealogyEdge.findMany({
      where: {
        treeType,
        parentBpCode: { in: frontier, mode: 'insensitive' },
      },
      select: {
        parentBpCode: true,
        childBpCode: true,
        treeType: true,
        leg: true,
        updatedAt: true,
      },
    });

    const nextFrontier: string[] = [];
    for (const edge of edges) {
      const edgeKey = `${edge.parentBpCode.toLowerCase()}|${edge.childBpCode.toLowerCase()}|${edge.treeType}`;
      if (seenEdge.has(edgeKey)) continue;
      seenEdge.add(edgeKey);
      allEdges.push(edge);

      const childKey = edge.childBpCode.toLowerCase();
      if (!seenBp.has(childKey)) {
        seenBp.add(childKey);
        nextFrontier.push(edge.childBpCode);
      }
    }
    frontier = nextFrontier;
  }

  return allEdges;
}

export async function getAllGenealogyEdgesForTree(treeType: 'sponsor' | 'binary') {
  const prisma = getPrisma();
  return prisma.genealogyEdge.findMany({
    where: { treeType },
    select: {
      parentBpCode: true,
      childBpCode: true,
      treeType: true,
      leg: true,
    },
  });
}

export async function getGenealogyNodeNames(bpCodes: string[]): Promise<Map<string, string>> {
  if (bpCodes.length === 0) return new Map();
  const prisma = getPrisma();
  const lowered = bpCodes.map((c) => c.toLowerCase());
  const nodes = await prisma.genealogyNode.findMany({
    where: {
      OR: lowered.map((code) => ({ bpCode: { equals: code, mode: 'insensitive' as const } })),
    },
    select: { bpCode: true, bpName: true },
  });
  const map = new Map<string, string>();
  for (const n of nodes) {
    if (n.bpName) map.set(n.bpCode.toLowerCase(), n.bpName);
  }
  return map;
}
