import { Queue, type JobsOptions } from 'bullmq';
import type { BpHarvestJobPayload } from '@greencity/shared';
import { getRedisConnection } from './connection.js';
import { jobEnqueueDelayMs } from './enqueue-stagger.js';

export const BP_HARVEST_QUEUE_NAME = 'greencity-bp-harvest';

let harvestQueue: Queue<BpHarvestJobPayload> | undefined;

export function getBpHarvestQueue(): Queue<BpHarvestJobPayload> {
  if (!harvestQueue) {
    harvestQueue = new Queue<BpHarvestJobPayload>(BP_HARVEST_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return harvestQueue;
}

export interface BpHarvestJobInput {
  bpCode: string;
  bpName?: string;
  uid?: string;
  password?: string;
}

export async function enqueueBpHarvestJobs(
  batchRunId: string,
  bps: Array<BpHarvestJobInput & { modules: BpHarvestJobPayload['modules'] }>,
  chunkSize = 500,
): Promise<number> {
  const q = getBpHarvestQueue();
  let enqueued = 0;
  for (let i = 0; i < bps.length; i += chunkSize) {
    const chunk = bps.slice(i, i + chunkSize);
    await q.addBulk(
      chunk.map((bp, chunkIndex) => ({
        name: 'bp_harvest',
        data: {
          moduleKey: 'bp_harvest' as const,
          bpCode: bp.bpCode,
          bpName: bp.bpName,
          uid: bp.uid,
          password: bp.password,
          modules: bp.modules,
          parentRunId: batchRunId,
        },
        opts: {
          jobId: `bp_harvest-${batchRunId}-${bp.bpCode}`,
          delay: jobEnqueueDelayMs(i + chunkIndex),
        },
      })),
    );
    enqueued += chunk.length;
  }
  return enqueued;
}

export async function getBpHarvestQueueCounts(): Promise<{
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}> {
  const q = getBpHarvestQueue();
  const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    completed: counts.completed ?? 0,
  };
}

export async function obliterateBpHarvestQueue(): Promise<void> {
  const q = getBpHarvestQueue();
  await q.obliterate({ force: true });
}
