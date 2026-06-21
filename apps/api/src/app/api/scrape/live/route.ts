import { NextResponse } from 'next/server';
import { getPrisma, countRunningGenealogyBpJobs } from '@greencity/db';
import { getWorkerStatus, getGenealogyWorkerStatus, getBpHarvestQueueCounts } from '@greencity/queue';

type RunMetadata = Record<string, unknown>;

function meta(run: { metadata: unknown } | null): RunMetadata {
  if (!run?.metadata || typeof run.metadata !== 'object' || Array.isArray(run.metadata)) {
    return {};
  }
  return run.metadata as RunMetadata;
}

const BP_JOB_MODULE_KEYS = ['genealogy_bp', 'bp_harvest'] as const;

export async function GET() {
  try {
    const prisma = getPrisma();
    const worker = await getWorkerStatus();
    const genealogyWorker = await getGenealogyWorkerStatus();
    const useHarvestQueue = process.env.BP_HARVEST_QUEUE === 'true';

    let harvestQueue = { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 };
    if (useHarvestQueue) {
      harvestQueue = await getBpHarvestQueueCounts();
    }

    const genealogyBatch = await prisma.scrapeRun.findFirst({
      where: {
        moduleKey: 'genealogy_batch',
        status: { in: ['pending', 'running'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const latestGenealogyBatch = genealogyBatch
      ? genealogyBatch
      : await prisma.scrapeRun.findFirst({
          where: { moduleKey: 'genealogy_batch' },
          orderBy: { createdAt: 'desc' },
        });

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
    const recentBpThroughput = await prisma.scrapeRun.count({
      where: {
        moduleKey: { in: [...BP_JOB_MODULE_KEYS] },
        status: 'completed',
        finishedAt: { gte: fiveMinutesAgo },
      },
    });
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const lastMinuteBpCount = await prisma.scrapeRun.count({
      where: {
        moduleKey: { in: [...BP_JOB_MODULE_KEYS] },
        status: 'completed',
        finishedAt: { gte: oneMinuteAgo },
      },
    });
    const liveBpPerMin = Math.round((recentBpThroughput / 5) * 10) / 10;
    const liveBpPerMin1m = lastMinuteBpCount;

    const activeGenealogyBps = await prisma.scrapeRun.findMany({
      where: {
        moduleKey: { in: [...BP_JOB_MODULE_KEYS] },
        status: 'running',
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        moduleKey: true,
        bpCode: true,
        startedAt: true,
        metadata: true,
      },
    });

    const recentCompletedBps = await prisma.scrapeRun.findMany({
      where: {
        moduleKey: { in: [...BP_JOB_MODULE_KEYS] },
        status: { in: ['completed', 'failed', 'partial'] },
        bpCode: { not: null },
      },
      orderBy: { finishedAt: 'desc' },
      take: 5,
      select: {
        bpCode: true,
        status: true,
        finishedAt: true,
        rowCount: true,
      },
    });

    const orchestrator = await prisma.scrapeRun.findFirst({
      where: {
        moduleKey: 'portal_sequential',
        status: { in: ['pending', 'running'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const activeModule = await prisma.scrapeRun.findFirst({
      where: {
        status: 'running',
        moduleKey: { not: 'portal_sequential' },
      },
      orderBy: { startedAt: 'desc' },
    });

    const recentModules = await prisma.scrapeRun.findMany({
      where: {
        moduleKey: { not: 'portal_sequential' },
        status: { in: ['completed', 'failed', 'partial'] },
      },
      orderBy: { finishedAt: 'desc' },
      take: 10,
      select: {
        moduleKey: true,
        status: true,
        rowCount: true,
        rowsInserted: true,
        rowsUpdated: true,
        finishedAt: true,
        error: true,
      },
    });

    const orchMeta = meta(orchestrator);
    const activeMeta = meta(activeModule);
    const geneMeta = meta(latestGenealogyBatch);

    const activeCount = await countRunningGenealogyBpJobs();
    const batchCompleted = (geneMeta.completed as number) ?? 0;
    const batchFailed = (geneMeta.failed as number) ?? 0;
    const totalBps = (geneMeta.totalBps as number) ?? 0;
    const processed = batchCompleted + batchFailed;
    const remaining = Math.max(0, totalBps - processed);
    const workerCapacity = Number.parseInt(process.env.GENEALOGY_CONCURRENCY ?? '15', 10);

    const genealogyQueueActive = genealogyWorker.queue?.active ?? 0;
    const genealogyQueueWaiting = genealogyWorker.queue?.waiting ?? 0;
    const queueActive = useHarvestQueue ? harvestQueue.active : genealogyQueueActive;
    const queueWaiting = useHarvestQueue ? harvestQueue.waiting : genealogyQueueWaiting;
    const queueCompleted = useHarvestQueue ? harvestQueue.completed : (genealogyWorker.queue?.completed ?? 0);

    const batchBpPerMin =
      latestGenealogyBatch?.startedAt && batchCompleted > 0 && latestGenealogyBatch.status === 'running'
        ? batchCompleted / Math.max(1, (Date.now() - new Date(latestGenealogyBatch.startedAt).getTime()) / 60_000)
        : null;
    const bpPerMin = liveBpPerMin > 0 ? liveBpPerMin : batchBpPerMin;
    const etaMinutes =
      bpPerMin && bpPerMin > 0
        ? Math.ceil((queueWaiting + queueActive + remaining) / bpPerMin)
        : null;

    const genealogyActive = queueActive > 0 || queueWaiting > 0 || activeCount > 0;

    const progress = {
      currentModule: (orchMeta.currentModule as string) ?? activeModule?.moduleKey ?? null,
      currentLabel: (orchMeta.currentLabel as string) ?? null,
      navPath: (orchMeta.navPath as string[]) ?? null,
      moduleIndex: (orchMeta.moduleIndex as number) ?? null,
      totalModules: (orchMeta.totalModules as number) ?? null,
      pagesScraped: (activeMeta.pagesScraped as number) ?? null,
      rowsSoFar: activeModule?.rowCount ?? (activeMeta.rowsSoFar as number) ?? null,
      lastPage: (activeMeta.lastPage as number) ?? null,
      rowsInserted: activeModule?.rowsInserted ?? null,
      rowsUpdated: activeModule?.rowsUpdated ?? null,
      completedModules: (orchMeta.completedModules as string[]) ?? [],
      failedModules: (orchMeta.failedModules as string[]) ?? [],
    };

    return NextResponse.json({
      worker,
      genealogyWorker: {
        ...genealogyWorker,
        harvestQueue: useHarvestQueue ? harvestQueue : null,
      },
      genealogy: genealogyBatch
        ? {
            id: genealogyBatch.id,
            status: genealogyBatch.status,
            startedAt: genealogyBatch.startedAt,
            progress: {
              totalBps: geneMeta.totalBps ?? null,
              completed: geneMeta.completed ?? null,
              failed: geneMeta.failed ?? null,
              skipped: geneMeta.skipped ?? null,
              enqueued: geneMeta.enqueued ?? null,
              orderStrategy: geneMeta.orderStrategy ?? null,
              firstBp: geneMeta.firstBp ?? null,
              lastBp: geneMeta.lastBp ?? null,
              activeCount,
              queueActive,
              queueWaiting,
              genealogyQueueActive,
              genealogyQueueWaiting,
              harvestQueueActive: useHarvestQueue ? harvestQueue.active : null,
              harvestQueueWaiting: useHarvestQueue ? harvestQueue.waiting : null,
              workerCapacity,
              etaMinutes,
              bpPerMin: bpPerMin ? Math.round(bpPerMin * 10) / 10 : null,
              currentBp: (geneMeta.currentBp as string) ?? activeGenealogyBps[0]?.bpCode ?? null,
              index: processed > 0 ? processed : null,
              processed,
              remaining,
            },
            activeBps: activeGenealogyBps.map((run) => ({
              bpCode: run.bpCode,
              moduleKey: run.moduleKey,
              startedAt: run.startedAt,
              metadata: meta(run),
            })),
            recentCompletedBps,
          }
        : null,
      orchestrator: orchestrator
        ? {
            id: orchestrator.id,
            status: orchestrator.status,
            startedAt: orchestrator.startedAt,
            metadata: orchMeta,
          }
        : null,
      activeModule: activeModule
        ? {
            id: activeModule.id,
            moduleKey: activeModule.moduleKey,
            status: activeModule.status,
            rowCount: activeModule.rowCount,
            rowsInserted: activeModule.rowsInserted,
            rowsUpdated: activeModule.rowsUpdated,
            startedAt: activeModule.startedAt,
            metadata: activeMeta,
          }
        : null,
      progress,
      recentModules,
      timestamp: Date.now(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Live status failed' },
      { status: 500 },
    );
  }
}
