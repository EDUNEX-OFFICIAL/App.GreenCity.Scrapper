import { getScrapeQueue, getRedisConnection } from './index.js';
import { Redis } from 'ioredis';

export const WORKER_HEARTBEAT_KEY = 'greencity:worker:heartbeat';

function createRedis(): Redis {
  return new Redis(getRedisConnection() as never);
}

export async function setWorkerHeartbeat(): Promise<void> {
  const redis = createRedis();
  try {
    await redis.set(WORKER_HEARTBEAT_KEY, Date.now().toString(), 'EX', 120);
  } finally {
    await redis.quit();
  }
}

export async function getWorkerStatus(): Promise<{
  online: boolean;
  lastHeartbeat: number | null;
  queue: { waiting: number; active: number; delayed: number; failed: number };
}> {
  const queue = getScrapeQueue();
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');

  const redis = createRedis();
  let lastHeartbeat: number | null = null;
  try {
    const val = await redis.get(WORKER_HEARTBEAT_KEY);
    lastHeartbeat = val ? Number.parseInt(val, 10) : null;
  } finally {
    await redis.quit();
  }

  const online = lastHeartbeat !== null && Date.now() - lastHeartbeat < 120_000;

  return {
    online,
    lastHeartbeat,
    queue: {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    },
  };
}
