import { Worker } from '@greencity/queue';
import { createLogger, type GenealogyJobPayload } from '@greencity/shared';
import {
  getRedisConnection,
  GENEALOGY_QUEUE_NAME,
  setGenealogyWorkerHeartbeat,
} from '@greencity/queue';
import {
  registerBrowserPoolShutdown,
  shutdownAdminContext,
  isAdminContextEnabled,
  AdminContextManager,
  BrowserPool,
} from '@greencity/scraper-core';
import { reconcileRuns } from './worker.js';
import { runGenealogyBatchJob } from './genealogy-orchestrator.js';
import { runGenealogyBpJob } from './genealogy-runner.js';

const log = createLogger('genealogy-worker');

export async function startGenealogyWorker(): Promise<Worker<GenealogyJobPayload>> {
  await reconcileRuns();
  registerBrowserPoolShutdown();

  if (isAdminContextEnabled()) {
    await AdminContextManager.getInstance().getAdminPage().catch((err) => {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'Admin context warm-up failed');
    });
  }

  const concurrency = Number.parseInt(process.env.GENEALOGY_CONCURRENCY ?? '15', 10);

  const worker = new Worker<GenealogyJobPayload>(
    GENEALOGY_QUEUE_NAME,
    async (job) => {
      log.info({ jobId: job.id, moduleKey: job.data.moduleKey, bpCode: job.data.bpCode }, 'Processing genealogy job');
      if (job.data.moduleKey === 'genealogy_batch') {
        await runGenealogyBatchJob(job.data);
      } else {
        await runGenealogyBpJob(job.data);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency,
      lockDuration: 3_600_000,
      maxStalledCount: 5,
    },
  );

  worker.on('completed', (job) => log.info({ jobId: job.id }, 'Genealogy job completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err.message }, 'Genealogy job failed'));

  await setGenealogyWorkerHeartbeat();
  setInterval(() => setGenealogyWorkerHeartbeat().catch(() => undefined), 30_000);

  log.info({ concurrency }, 'Genealogy worker started');
  return worker;
}

export async function shutdownGenealogyInfrastructure(): Promise<void> {
  await shutdownAdminContext();
  await BrowserPool.getInstance().shutdown().catch(() => undefined);
}
