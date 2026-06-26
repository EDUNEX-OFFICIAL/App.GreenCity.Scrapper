import { Queue, type JobsOptions } from 'bullmq';
import type { GenealogyJobPayload } from '@greencity/shared';
import { getRedisConnection } from './connection.js';
import { jobEnqueueDelayMs } from './enqueue-stagger.js';

export const GENEALOGY_QUEUE_NAME = 'greencity-genealogy-scrape';

let genealogyQueue: Queue<GenealogyJobPayload> | undefined;

export function getGenealogyQueue(): Queue<GenealogyJobPayload> {
  if (!genealogyQueue) {
    genealogyQueue = new Queue<GenealogyJobPayload>(GENEALOGY_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return genealogyQueue;
}

export async function enqueueGenealogyBatch(
  payload: GenealogyJobPayload,
  opts: JobsOptions = {},
): Promise<string> {
  const q = getGenealogyQueue();
  const job = await q.add('genealogy_batch', payload, {
    jobId: payload.runId ? `genealogy_batch-${payload.runId}` : undefined,
    ...opts,
  });
  return job.id ?? '';
}

export interface GenealogyBpJobInput {
  bpCode: string;
  bpName?: string;
  uid?: string;
  password?: string;
}

export async function enqueueGenealogyBpJobs(
  batchRunId: string,
  bps: GenealogyBpJobInput[],
  chunkSize = 500,
): Promise<number> {
  const q = getGenealogyQueue();
  let enqueued = 0;
  for (let i = 0; i < bps.length; i += chunkSize) {
    const chunk = bps.slice(i, i + chunkSize);
    await q.addBulk(
      chunk.map((bp, chunkIndex) => ({
        name: 'genealogy_bp',
        data: {
          moduleKey: 'genealogy_bp' as const,
          bpCode: bp.bpCode,
          bpName: bp.bpName,
          uid: bp.uid,
          password: bp.password,
          parentRunId: batchRunId,
        },
        opts: {
          jobId: `genealogy_bp-${batchRunId}-${bp.bpCode}`,
          delay: jobEnqueueDelayMs(i + chunkIndex),
        },
      })),
    );
    enqueued += chunk.length;
  }
  return enqueued;
}

export async function getGenealogyQueueCounts(): Promise<{
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}> {
  const q = getGenealogyQueue();
  const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    completed: counts.completed ?? 0,
  };
}

export async function obliterateGenealogyQueue(): Promise<void> {
  const q = getGenealogyQueue();
  await q.obliterate({ force: true });
}
