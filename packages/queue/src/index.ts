import { Queue, Worker, type JobsOptions, type ConnectionOptions } from 'bullmq';
import type { ScrapeJobPayload } from '@greencity/shared';

export const QUEUE_NAME = 'greencity-module-scrape';

let queue: Queue<ScrapeJobPayload> | undefined;

export function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6380';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export function getScrapeQueue(): Queue<ScrapeJobPayload> {
  if (!queue) {
    queue = new Queue<ScrapeJobPayload>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return queue;
}

export async function enqueueScrapeJob(
  payload: ScrapeJobPayload,
  opts: JobsOptions = {},
): Promise<string> {
  const q = getScrapeQueue();
  const job = await q.add(payload.moduleKey, payload, {
    jobId: payload.runId ? `${payload.moduleKey}-${payload.runId}` : undefined,
    ...opts,
  });
  return job.id ?? '';
}

export async function enqueueBackfillJobs(
  payloads: ScrapeJobPayload[],
): Promise<number> {
  const q = getScrapeQueue();
  await q.addBulk(
    payloads.map((payload, i) => ({
      name: payload.moduleKey,
      data: payload,
      opts: { delay: i * 2000 },
    })),
  );
  return payloads.length;
}

export async function cleanFailedJobs(): Promise<number> {
  const q = getScrapeQueue();
  const removed = await q.clean(0, 1000, 'failed');
  return removed.length;
}

export { Worker, type ConnectionOptions } from 'bullmq';
export { runBackfillOrchestrator, markBackfillChunkComplete } from './backfill.js';
export { getWorkerStatus, setWorkerHeartbeat, WORKER_HEARTBEAT_KEY } from './worker-status.js';
export {
  GENEALOGY_QUEUE_NAME,
  getGenealogyQueue,
  enqueueGenealogyBatch,
  enqueueGenealogyBpJobs,
  getGenealogyQueueCounts,
  obliterateGenealogyQueue,
} from './genealogy-queue.js';
export {
  GENEALOGY_WORKER_HEARTBEAT_KEY,
  getGenealogyWorkerStatus,
  setGenealogyWorkerHeartbeat,
} from './genealogy-worker-status.js';
export {
  BP_HARVEST_QUEUE_NAME,
  getBpHarvestQueue,
  enqueueBpHarvestJobs,
  getBpHarvestQueueCounts,
  obliterateBpHarvestQueue,
} from './harvest-queue.js';
