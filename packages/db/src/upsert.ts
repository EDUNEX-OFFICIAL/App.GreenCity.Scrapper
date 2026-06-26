import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getPrisma } from './client.js';
import { computeRowHash, stableStringify, type NormalizedRow } from '@greencity/shared';

export interface UpsertRowsResult {
  inserted: number;
  updated: number;
  total: number;
}

const UPSERT_BATCH_SIZE = 500;

function failedRowHash(moduleKey: string, failedRef: string): string {
  return createHash('sha256').update(`failed:${moduleKey}:${failedRef}`).digest('hex');
}

function buildFailedRef(params: {
  scrapeRunId: string;
  pageNum?: number;
  identifiers?: Record<string, string>;
  failedRef?: string;
}): string {
  if (params.failedRef) return params.failedRef;
  if (params.pageNum != null) return `page:${params.pageNum}`;
  const bpId = params.identifiers?.['BP ID']?.trim();
  if (bpId) return `bp:${bpId}`;
  if (params.identifiers && Object.keys(params.identifiers).length > 0) {
    return `pk:${stableStringify(params.identifiers)}`;
  }
  return `run:${params.scrapeRunId}`;
}

function buildFailedRowJson(params: {
  pageNum?: number;
  identifiers?: Record<string, string>;
}): NormalizedRow {
  const rowJson: NormalizedRow = { Status: 'failed' };
  if (params.pageNum != null) rowJson.Page = String(params.pageNum);
  if (params.identifiers) {
    for (const [k, v] of Object.entries(params.identifiers)) {
      if (v) rowJson[k] = v;
    }
  }
  return rowJson;
}

export async function incrementRunFailedItems(scrapeRunId: string): Promise<void> {
  const prisma = getPrisma();
  const run = await prisma.scrapeRun.findUnique({
    where: { id: scrapeRunId },
    select: { metadata: true },
  });
  const meta =
    run?.metadata && typeof run.metadata === 'object' && !Array.isArray(run.metadata)
      ? (run.metadata as Record<string, unknown>)
      : {};
  const failedItems = ((meta.failedItems as number) ?? 0) + 1;
  await prisma.scrapeRun.update({
    where: { id: scrapeRunId },
    data: { metadata: { ...meta, failedItems } as Prisma.InputJsonValue },
  });
}

export async function upsertFailedModuleRow(params: {
  moduleKey: string;
  portal: 'admin' | 'bp';
  bpCode?: string | null;
  scrapeRunId: string;
  error: string;
  pageNum?: number;
  identifiers?: Record<string, string>;
  failedRef?: string;
}): Promise<void> {
  const prisma = getPrisma();
  const failedRef = buildFailedRef(params);
  const rowJson = buildFailedRowJson({ pageNum: params.pageNum, identifiers: params.identifiers });
  const rowHash = failedRowHash(params.moduleKey, failedRef);
  const now = new Date();

  await prisma.rawModuleRow.upsert({
    where: { moduleKey_failedRef: { moduleKey: params.moduleKey, failedRef } },
    create: {
      moduleKey: params.moduleKey,
      portal: params.portal,
      bpCode: params.bpCode ?? null,
      rowJson: rowJson as Prisma.InputJsonValue,
      rowHash,
      failedRef,
      scrapeStatus: 'failed',
      scrapeError: params.error,
      scrapeRunId: params.scrapeRunId,
    },
    update: {
      rowJson: rowJson as Prisma.InputJsonValue,
      scrapeError: params.error,
      scrapeRunId: params.scrapeRunId,
      scrapeStatus: 'failed',
      lastSeenAt: now,
    },
  });

  await incrementRunFailedItems(params.scrapeRunId);
}

export async function upsertFailedGenealogyNode(params: {
  bpCode: string;
  uid: string;
  bpName?: string | null;
  scrapeRunId: string;
  error: string;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.genealogyNode.upsert({
    where: { uid_treeType: { uid: params.uid, treeType: 'sponsor' } },
    create: {
      bpCode: params.bpCode,
      bpName: params.bpName ?? null,
      uid: params.uid,
      treeType: 'sponsor',
      modalData: {},
      childrenJson: [],
      scrapeStatus: 'failed',
      scrapeError: params.error,
      scrapeRunId: params.scrapeRunId,
    },
    update: {
      bpCode: params.bpCode,
      bpName: params.bpName ?? null,
      uid: params.uid,
      scrapeStatus: 'failed',
      scrapeError: params.error,
      scrapeRunId: params.scrapeRunId,
      scrapedAt: new Date(),
    },
  });
  await incrementRunFailedItems(params.scrapeRunId);
}

export async function countFailedRows(moduleKey: string): Promise<number> {
  const prisma = getPrisma();
  return prisma.rawModuleRow.count({ where: { moduleKey, scrapeStatus: 'failed' } });
}

export async function countFailedRowsForRun(moduleKey: string, scrapeRunId: string): Promise<number> {
  const prisma = getPrisma();
  return prisma.rawModuleRow.count({
    where: { moduleKey, scrapeStatus: 'failed', scrapeRunId },
  });
}

export async function countFailedGenealogyNodes(): Promise<number> {
  const prisma = getPrisma();
  return prisma.genealogyNode.count({ where: { scrapeStatus: 'failed' } });
}

export async function countScrapeFailuresForRun(scrapeRunId: string): Promise<number> {
  const prisma = getPrisma();
  return prisma.scrapeFailure.count({ where: { scrapeRunId } });
}

/** Failed grid page numbers for a module (`failedRef` = `page:N`). */
export async function getFailedPageRefs(moduleKey: string): Promise<number[]> {
  const prisma = getPrisma();
  const rows = await prisma.rawModuleRow.findMany({
    where: {
      moduleKey,
      scrapeStatus: 'failed',
      failedRef: { startsWith: 'page:' },
    },
    select: { failedRef: true },
  });
  const pages = rows
    .map((r) => Number.parseInt((r.failedRef ?? '').replace(/^page:/, ''), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(pages)].sort((a, b) => a - b);
}

export async function clearFailedPageRef(moduleKey: string, pageNum: number): Promise<void> {
  const prisma = getPrisma();
  await prisma.rawModuleRow.deleteMany({
    where: { moduleKey, failedRef: `page:${pageNum}`, scrapeStatus: 'failed' },
  });
}

export async function deleteFailedPageRefs(moduleKey: string, pageNums: number[]): Promise<number> {
  if (pageNums.length === 0) return 0;
  const prisma = getPrisma();
  const refs = pageNums.map((n) => `page:${n}`);
  const result = await prisma.rawModuleRow.deleteMany({
    where: { moduleKey, failedRef: { in: refs }, scrapeStatus: 'failed' },
  });
  return result.count;
}

async function clearFailedStubForRow(
  moduleKey: string,
  row: NormalizedRow,
): Promise<void> {
  const prisma = getPrisma();
  const bpId = row['BP ID']?.trim();
  const failedRef = bpId ? `bp:${bpId}` : null;
  if (!failedRef) return;
  await prisma.rawModuleRow.deleteMany({
    where: { moduleKey, failedRef, scrapeStatus: 'failed' },
  });
}

export async function upsertModuleRows(params: {
  moduleKey: string;
  portal: 'admin' | 'bp';
  bpCode?: string | null;
  scrapeRunId: string;
  rows: NormalizedRow[];
}): Promise<UpsertRowsResult> {
  if (params.rows.length === 0) {
    return { inserted: 0, updated: 0, total: 0 };
  }

  const prisma = getPrisma();
  let inserted = 0;
  let updated = 0;
  const now = new Date();
  const scope = {
    moduleKey: params.moduleKey,
    portal: params.portal,
    bpCode: params.bpCode,
  };

  for (let offset = 0; offset < params.rows.length; offset += UPSERT_BATCH_SIZE) {
    const chunk = params.rows.slice(offset, offset + UPSERT_BATCH_SIZE);
    const prepared = chunk.map((row) => ({
      row,
      rowHash: computeRowHash(row, scope),
    }));
    const hashes = prepared.map((p) => p.rowHash);

    const existing = await prisma.rawModuleRow.findMany({
      where: { rowHash: { in: hashes } },
      select: { rowHash: true },
    });
    const existingSet = new Set(existing.map((e) => e.rowHash));

    const toCreate = prepared.filter((p) => !existingSet.has(p.rowHash));
    const toTouch = prepared.filter((p) => existingSet.has(p.rowHash));

    if (toCreate.length > 0) {
      const created = await prisma.rawModuleRow.createMany({
        data: toCreate.map((p) => ({
          moduleKey: params.moduleKey,
          portal: params.portal,
          bpCode: params.bpCode ?? null,
          rowJson: p.row as Prisma.InputJsonValue,
          rowHash: p.rowHash,
          scrapeRunId: params.scrapeRunId,
          scrapeStatus: 'ok' as const,
          scrapeError: null,
          failedRef: null,
        })),
        skipDuplicates: true,
      });
      inserted += created.count;
    }

    if (toTouch.length > 0) {
      const touched = await prisma.rawModuleRow.updateMany({
        where: { rowHash: { in: toTouch.map((p) => p.rowHash) } },
        data: {
          lastSeenAt: now,
          scrapeRunId: params.scrapeRunId,
          scrapeStatus: 'ok',
          scrapeError: null,
        },
      });
      updated += touched.count;
    }

    for (const p of prepared) {
      await clearFailedStubForRow(params.moduleKey, p.row);
    }
  }

  return { inserted, updated, total: params.rows.length };
}

export async function createScrapeRun(params: {
  moduleKey: string;
  portal: 'admin' | 'bp';
  bpCode?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const prisma = getPrisma();
  return prisma.scrapeRun.create({
    data: {
      moduleKey: params.moduleKey,
      portal: params.portal,
      bpCode: params.bpCode ?? null,
      status: 'pending',
      metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function finishScrapeRun(
  id: string,
  result: {
    status: 'completed' | 'failed' | 'partial';
    rowCount: number;
    rowsInserted: number;
    rowsUpdated: number;
    error?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const prisma = getPrisma();
  const existing = await prisma.scrapeRun.findUnique({ where: { id }, select: { metadata: true } });
  const prevMeta =
    existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const mergedMeta = result.metadata ? { ...prevMeta, ...result.metadata } : prevMeta;

  return prisma.scrapeRun.update({
    where: { id },
    data: {
      status: result.status,
      finishedAt: new Date(),
      rowCount: result.rowCount,
      rowsInserted: result.rowsInserted,
      rowsUpdated: result.rowsUpdated,
      error: result.error ?? null,
      metadata: Object.keys(mergedMeta).length > 0 ? (mergedMeta as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function recordScrapeFailure(params: {
  scrapeRunId: string;
  moduleKey: string;
  url?: string;
  error: string;
  htmlPath?: string;
}) {
  const prisma = getPrisma();
  return prisma.scrapeFailure.create({ data: params });
}
