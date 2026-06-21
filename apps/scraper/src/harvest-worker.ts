import { Worker } from '@greencity/queue';
import { createLogger, type BpHarvestJobPayload } from '@greencity/shared';
import {
  getRedisConnection,
  BP_HARVEST_QUEUE_NAME,
  setGenealogyWorkerHeartbeat,
} from '@greencity/queue';
import { runBpHarvestJob } from './bp-harvest-runner.js';

const log = createLogger('harvest-worker');

export async function startHarvestWorker(): Promise<Worker<BpHarvestJobPayload>> {
  const concurrency = Number.parseInt(process.env.GENEALOGY_CONCURRENCY ?? '15', 10);

  const worker = new Worker<BpHarvestJobPayload>(
    BP_HARVEST_QUEUE_NAME,
    async (job) => {
      log.info({ jobId: job.id, bpCode: job.data.bpCode, modules: job.data.modules }, 'Processing BP harvest job');
      await runBpHarvestJob(job.data);
    },
    {
      connection: getRedisConnection(),
      concurrency,
      lockDuration: 3_600_000,
      maxStalledCount: 5,
    },
  );

  worker.on('completed', (job) => log.info({ jobId: job.id }, 'BP harvest job completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err.message }, 'BP harvest job failed'));

  log.info({ concurrency }, 'BP harvest worker started');
  return worker;
}

export async function startHarvestWorkerIfEnabled(): Promise<Worker<BpHarvestJobPayload> | null> {
  if (process.env.BP_HARVEST_QUEUE !== 'true') return null;
  await setGenealogyWorkerHeartbeat();
  return startHarvestWorker();
}
