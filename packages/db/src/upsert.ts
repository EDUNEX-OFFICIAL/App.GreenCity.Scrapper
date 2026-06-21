import { Prisma } from '@prisma/client';
import { getPrisma } from './client.js';
import { computeRowHash, type NormalizedRow } from '@greencity/shared';

export interface UpsertRowsResult {
  inserted: number;
  updated: number;
  total: number;
}

const UPSERT_BATCH_SIZE = 500;

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
        },
      });
      updated += touched.count;
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
  return prisma.scrapeRun.update({
    where: { id },
    data: {
      status: result.status,
      finishedAt: new Date(),
      rowCount: result.rowCount,
      rowsInserted: result.rowsInserted,
      rowsUpdated: result.rowsUpdated,
      error: result.error ?? null,
      metadata: result.metadata ? (result.metadata as Prisma.InputJsonValue) : undefined,
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
