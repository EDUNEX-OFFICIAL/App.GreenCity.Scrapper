import { createLogger, type GenealogyJobPayload } from '@greencity/shared';
import {
  createScrapeRun,
  findActiveGenealogyBatch,
  getBpListEntriesForGenealogy,
  getCompletedBpCodes,
} from '@greencity/db';

const log = createLogger('genealogy-orchestrator');

export async function enqueueGenealogyBatchIfEnabled(parentRunId?: string): Promise<string | null> {
  if (process.env.GENEALOGY_ENABLED === 'false') return null;

  const existing = await findActiveGenealogyBatch();
  if (existing) {
    log.info({ runId: existing.id }, 'Genealogy batch already active — skipping enqueue');
    return existing.id;
  }

  const { enqueueGenealogyBatch } = await import('@greencity/queue');
  const run = await createScrapeRun({
    moduleKey: 'genealogy_batch',
    portal: 'bp',
    metadata: { parentRunId, triggeredBy: 'bp_list_complete' },
  });

  await enqueueGenealogyBatch({
    moduleKey: 'genealogy_batch',
    runId: run.id,
    parentRunId,
    triggeredBy: 'bp_list_complete',
  });

  log.info({ runId: run.id }, 'Genealogy batch enqueued');
  return run.id;
}

export async function runGenealogyBatchJob(payload: GenealogyJobPayload): Promise<void> {
  const batchRunId = payload.runId;
  if (!batchRunId) throw new Error('genealogy_batch requires runId');

  const orderStrategy = process.env.GENEALOGY_BP_ORDER ?? 'leaf_first';
  const maxRaw = process.env.GENEALOGY_MAX_BPS;
  const maxBps = maxRaw ? Number.parseInt(maxRaw, 10) : undefined;

  let bps = await getBpListEntriesForGenealogy();
  const completedSet = await getCompletedBpCodes();
  const skipped = bps.filter((bp) => bp.uid && completedSet.has(bp.uid));

  if (payload.retryFailedOnly) {
    // After clearing failed stubs, use incomplete BPs (missing sponsor and/or binary OK).
    bps = bps.filter((bp) => !bp.uid || !completedSet.has(bp.uid));
    log.info({ retryCount: bps.length }, 'Retry-failed-only batch — enqueueing incomplete BPs');
  } else {
    bps = bps.filter((bp) => !bp.uid || !completedSet.has(bp.uid));
  }
  if (maxBps && Number.isFinite(maxBps)) bps = bps.slice(0, maxBps);

  const prisma = (await import('@greencity/db')).getPrisma();
  await prisma.scrapeRun.update({
    where: { id: batchRunId },
    data: {
      status: 'running',
      startedAt: new Date(),
      metadata: {
        totalBps: bps.length,
        enqueued: 0,
        completed: 0,
        failed: 0,
        skipped: skipped.length,
        retryFailedOnly: payload.retryFailedOnly ?? false,
        orderStrategy,
        firstBp: bps[0]?.bpCode ?? null,
        lastBp: bps[bps.length - 1]?.bpCode ?? null,
      },
    },
  });

  if (bps.length === 0) {
    const { finishScrapeRun } = await import('@greencity/db');
    await finishScrapeRun(batchRunId, {
      status: 'completed',
      rowCount: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      metadata: { totalBps: 0, completed: 0, failed: 0, skipped: skipped.length, orderStrategy },
    });
    log.info('No BPs to enqueue — all already scraped');
    return;
  }

  const useHarvestQueue = process.env.BP_HARVEST_QUEUE === 'true';
  let enqueued: number;

  if (useHarvestQueue) {
    const { enqueueBpHarvestJobs } = await import('@greencity/queue');
    enqueued = await enqueueBpHarvestJobs(
      batchRunId,
      bps.map((bp) => ({ ...bp, modules: ['profile', 'genealogy'] satisfies import('@greencity/shared').BpHarvestModuleName[] })),
    );
  } else {
    const { enqueueGenealogyBpJobs } = await import('@greencity/queue');
    enqueued = await enqueueGenealogyBpJobs(batchRunId, bps);
  }
  await prisma.scrapeRun.update({
    where: { id: batchRunId },
    data: {
      metadata: {
        totalBps: bps.length,
        enqueued,
        completed: 0,
        failed: 0,
        skipped: skipped.length,
        retryFailedOnly: payload.retryFailedOnly ?? false,
        orderStrategy,
        firstBp: bps[0]?.bpCode ?? null,
        lastBp: bps[bps.length - 1]?.bpCode ?? null,
      },
    },
  });

  log.info(
    {
      batchRunId,
      enqueued,
      skipped: skipped.length,
      orderStrategy,
      firstBp: bps[0]?.bpCode,
      lastBp: bps[bps.length - 1]?.bpCode,
    },
    'Genealogy batch coordinator finished — BP jobs enqueued (leaves first, Vistaar last)',
  );
}
