import { getPrisma } from './client.js';

const STALE_MINUTES = 15;

export async function reconcileStaleRuns(staleMinutes = STALE_MINUTES): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);

  const result = await prisma.scrapeRun.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: cutoff },
    },
    data: {
      status: 'failed',
      error: 'Worker timeout / stale run recovered',
      finishedAt: new Date(),
    },
  });

  return result.count;
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
