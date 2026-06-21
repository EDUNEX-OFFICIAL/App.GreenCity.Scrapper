import { getBackfillModules, type ScrapeJobPayload } from '@greencity/shared';
import { getPrisma } from '@greencity/db';
import { enqueueBackfillJobs } from './index.js';

function generateDailyChunks(from: string, to: string, chunkDays = 30): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  const start = new Date(from);
  const end = new Date(to);

  for (let cur = new Date(start); cur <= end; ) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      from: cur.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });
    cur = new Date(chunkEnd);
    cur.setDate(cur.getDate() + 1);
  }

  return chunks;
}

export async function runBackfillOrchestrator(): Promise<number> {
  const prisma = getPrisma();
  const modules = getBackfillModules();
  const payloads: ScrapeJobPayload[] = [];
  const endDate = new Date().toISOString().slice(0, 10);

  for (const mod of modules) {
    const backfill = mod.backfill!;
    const startDate =
      backfill.startStrategy === 'fixed' && backfill.fixedFrom
        ? backfill.fixedFrom
        : '2010-01-01';

    await prisma.backfillProgress.upsert({
      where: { moduleKey_portal_bpCode: { moduleKey: mod.key, portal: 'admin', bpCode: null as unknown as string } },
      create: {
        moduleKey: mod.key,
        portal: 'admin',
        dateFrom: startDate,
        dateTo: endDate,
        status: 'running',
        currentCursor: startDate,
      },
      update: {
        dateFrom: startDate,
        dateTo: endDate,
        status: 'running',
        currentCursor: startDate,
      },
    });

    if (backfill.type === 'daily') {
      const chunks = generateDailyChunks(startDate, endDate, 30);
      for (const chunk of chunks) {
        const run = await prisma.scrapeRun.create({
          data: {
            moduleKey: mod.key,
            portal: 'admin',
            status: 'pending',
            metadata: { backfill: true, ...chunk },
          },
        });
        payloads.push({
          moduleKey: mod.key,
          portal: 'admin',
          dateFrom: chunk.from,
          dateTo: chunk.to,
          runId: run.id,
        });
      }

      await prisma.backfillProgress.update({
        where: { moduleKey_portal_bpCode: { moduleKey: mod.key, portal: 'admin', bpCode: null as unknown as string } },
        data: { totalChunks: chunks.length, completedChunks: 0 },
      });
    } else {
      const run = await prisma.scrapeRun.create({
        data: {
          moduleKey: mod.key,
          portal: 'admin',
          status: 'pending',
          metadata: { backfill: true, dateFrom: startDate, dateTo: endDate },
        },
      });
      payloads.push({
        moduleKey: mod.key,
        portal: 'admin',
        dateFrom: startDate,
        dateTo: endDate,
        runId: run.id,
      });
    }
  }

  if (payloads.length > 0) {
    await enqueueBackfillJobs(payloads);
  }

  return payloads.length;
}

export async function markBackfillChunkComplete(moduleKey: string): Promise<void> {
  const prisma = getPrisma();
  const progress = await prisma.backfillProgress.findUnique({
    where: { moduleKey_portal_bpCode: { moduleKey, portal: 'admin', bpCode: null as unknown as string } },
  });
  if (!progress) return;

  const completed = progress.completedChunks + 1;
  await prisma.backfillProgress.update({
    where: { id: progress.id },
    data: {
      completedChunks: completed,
      status: completed >= progress.totalChunks ? 'completed' : 'running',
    },
  });
}
