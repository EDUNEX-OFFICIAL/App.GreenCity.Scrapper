import { Worker } from '@greencity/queue';
import {
  getAllAdminModules,
  getBackfillModules,
  getModulesBySchedule,
  createLogger,
  loadConfig,
  type ScrapeJobPayload,
} from '@greencity/shared';
import { enqueueScrapeJob, getRedisConnection, QUEUE_NAME, setWorkerHeartbeat } from '@greencity/queue';
import { getPrisma, reconcileStaleRuns, reconcilePendingRuns } from '@greencity/db';
import { runModuleJob } from './runner.js';
import { runBackfillOrchestrator } from './backfill.js';

const log = createLogger('worker');

export async function reconcileRuns(): Promise<{ stale: number; pending: number }> {
  const stale = await reconcileStaleRuns(15);
  const pending = await reconcilePendingRuns(60);
  if (stale > 0 || pending > 0) {
    log.info({ stale, pending }, 'Reconciled zombie scrape runs');
  }
  return { stale, pending };
}

export async function startWorker(): Promise<Worker<ScrapeJobPayload>> {
  await reconcileRuns();

  const cfg = loadConfig();
  const worker = new Worker<ScrapeJobPayload>(
    QUEUE_NAME,
    async (job) => {
      log.info({ jobId: job.id, moduleKey: job.data.moduleKey }, 'Processing job');
      await runModuleJob(job.data);
    },
    {
      connection: getRedisConnection(),
      concurrency: cfg.scraperConcurrency,
      limiter: { max: cfg.scraperConcurrency, duration: cfg.scraperDelayMs },
      lockDuration: 3_600_000,
      maxStalledCount: 5,
    },
  );

  worker.on('completed', (job) => log.info({ jobId: job.id }, 'Job completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err.message }, 'Job failed'));

  await setWorkerHeartbeat();
  setInterval(() => setWorkerHeartbeat().catch(() => undefined), 30_000);
  setInterval(() => reconcileRuns().catch(() => undefined), 5 * 60_000);

  log.info({ concurrency: cfg.scraperConcurrency }, 'Worker started');
  return worker;
}

export async function seedModuleSchedules(): Promise<void> {
  const prisma = getPrisma();
  const weekly = getModulesBySchedule('weekly');
  const daily = getModulesBySchedule('daily');
  const hourly = getModulesBySchedule('hourly');

  for (const m of weekly) {
    await prisma.moduleSchedule.upsert({
      where: { moduleKey: m.key },
      create: { moduleKey: m.key, cron: '0 3 * * 0', enabled: true, priority: 1 },
      update: {},
    });
  }
  for (const m of daily) {
    await prisma.moduleSchedule.upsert({
      where: { moduleKey: m.key },
      create: { moduleKey: m.key, cron: '0 2 * * *', enabled: true, priority: 5 },
      update: {},
    });
  }
  for (const m of hourly) {
    await prisma.moduleSchedule.upsert({
      where: { moduleKey: m.key },
      create: { moduleKey: m.key, cron: '0 * * * *', enabled: true, priority: 10 },
      update: {},
    });
  }
}

export async function enqueueScheduledModules(): Promise<number> {
  const prisma = getPrisma();
  const schedules = await prisma.moduleSchedule.findMany({ where: { enabled: true } });
  let count = 0;

  for (const s of schedules) {
    const run = await createScrapeRunFromSchedule(s.moduleKey);
    await enqueueScrapeJob({ moduleKey: s.moduleKey, portal: 'admin', runId: run.id });
    count++;
  }

  return count;
}

async function createScrapeRunFromSchedule(moduleKey: string) {
  const prisma = getPrisma();
  return prisma.scrapeRun.create({
    data: { moduleKey, portal: 'admin', status: 'pending' },
  });
}

export async function enqueueAllAdminModules(): Promise<number> {
  const modules = getAllAdminModules();
  let count = 0;
  for (const m of modules) {
    const prisma = getPrisma();
    const run = await prisma.scrapeRun.create({
      data: { moduleKey: m.key, portal: 'admin', status: 'pending' },
    });
    await enqueueScrapeJob({ moduleKey: m.key, portal: 'admin', runId: run.id });
    count++;
  }
  return count;
}

export { runBackfillOrchestrator };
