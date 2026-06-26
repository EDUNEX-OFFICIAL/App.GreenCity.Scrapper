import { getScrapeQueue } from './index.js';
import { getSharedRedis } from './redis-client.js';

export const WORKER_HEARTBEAT_KEY = 'greencity:worker:heartbeat';

export async function setWorkerHeartbeat(): Promise<void> {
  const redis = getSharedRedis();
  await redis.set(WORKER_HEARTBEAT_KEY, Date.now().toString(), 'EX', 120);
}

export async function getWorkerStatus(): Promise<{
  online: boolean;
  lastHeartbeat: number | null;
  queue: { waiting: number; active: number; delayed: number; failed: number; completed: number };
}> {
  const queue = getScrapeQueue();
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');

  const redis = getSharedRedis();
  const val = await redis.get(WORKER_HEARTBEAT_KEY);
  const lastHeartbeat = val ? Number.parseInt(val, 10) : null;

  const online = lastHeartbeat !== null && Date.now() - lastHeartbeat < 120_000;

  return {
    online,
    lastHeartbeat,
    queue: {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    },
  };
}
