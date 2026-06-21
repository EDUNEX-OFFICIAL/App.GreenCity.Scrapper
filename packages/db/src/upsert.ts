import { Prisma } from '@prisma/client';
import { getPrisma } from './client.js';
import { computeRowHash, type NormalizedRow } from '@greencity/shared';

export interface UpsertRowsResult {
  inserted: number;
  updated: number;
  total: number;
}

export async function upsertModuleRows(params: {
  moduleKey: string;
  portal: 'admin' | 'bp';
  bpCode?: string | null;
  scrapeRunId: string;
  rows: NormalizedRow[];
}): Promise<UpsertRowsResult> {
  const prisma = getPrisma();
  let inserted = 0;
  let updated = 0;

  for (const row of params.rows) {
    const rowHash = computeRowHash(row, {
      moduleKey: params.moduleKey,
      portal: params.portal,
      bpCode: params.bpCode,
    });
    const existing = await prisma.rawModuleRow.findUnique({ where: { rowHash } });
    if (existing) {
      await prisma.rawModuleRow.update({
        where: { rowHash },
        data: {
          lastSeenAt: new Date(),
          scrapeRunId: params.scrapeRunId,
          rowJson: row as Prisma.InputJsonValue,
        },
      });
      updated++;
    } else {
      await prisma.rawModuleRow.create({
        data: {
          moduleKey: params.moduleKey,
          portal: params.portal,
          bpCode: params.bpCode ?? null,
          rowJson: row as Prisma.InputJsonValue,
          rowHash,
          scrapeRunId: params.scrapeRunId,
        },
      });
      inserted++;
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
