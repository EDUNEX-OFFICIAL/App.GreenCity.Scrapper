import { getPrisma } from './client.js';

const STALE_MINUTES = 15;
const LONG_RUNNING_MODULE_KEYS = ['genealogy_batch', 'portal_sequential'] as const;
const LONG_RUNNING_STALE_MINUTES = 360;

export async function reconcileStaleRuns(staleMinutes = STALE_MINUTES): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
  const longCutoff = new Date(Date.now() - LONG_RUNNING_STALE_MINUTES * 60 * 1000);

  const [shortLived, longLived] = await prisma.$transaction([
    prisma.scrapeRun.updateMany({
      where: {
        status: 'running',
        startedAt: { lt: cutoff },
        moduleKey: { notIn: [...LONG_RUNNING_MODULE_KEYS] },
      },
      data: {
        status: 'failed',
        error: 'Worker timeout / stale run recovered',
        finishedAt: new Date(),
      },
    }),
    prisma.scrapeRun.updateMany({
      where: {
        status: 'running',
        startedAt: { lt: longCutoff },
        moduleKey: { in: [...LONG_RUNNING_MODULE_KEYS] },
      },
      data: {
        status: 'failed',
        error: 'Worker timeout / stale run recovered',
        finishedAt: new Date(),
      },
    }),
  ]);

  return shortLived.count + longLived.count;
}

export async function reconcilePendingRuns(staleMinutes = 60): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);

  const result = await prisma.scrapeRun.updateMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
    },
    data: {
      status: 'failed',
      error: 'Job never picked up by worker — queue may be offline',
      finishedAt: new Date(),
    },
  });

  return result.count;
}
