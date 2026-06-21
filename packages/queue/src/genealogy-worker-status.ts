import { Redis } from 'ioredis';
import { getRedisConnection } from './index.js';
import { getGenealogyQueueCounts } from './genealogy-queue.js';

export const GENEALOGY_WORKER_HEARTBEAT_KEY = 'greencity:genealogy-worker:heartbeat';

function createRedis(): Redis {
  return new Redis(getRedisConnection() as never);
}

export async function setGenealogyWorkerHeartbeat(): Promise<void> {
  const redis = createRedis();
  try {
    await redis.set(GENEALOGY_WORKER_HEARTBEAT_KEY, Date.now().toString(), 'EX', 120);
  } finally {
    await redis.quit();
  }
}

export async function getGenealogyWorkerStatus(): Promise<{
  online: boolean;
  lastHeartbeat: number | null;
  queue: { waiting: number; active: number; delayed: number; failed: number };
}> {
  const queue = await getGenealogyQueueCounts();
  const redis = createRedis();
  let lastHeartbeat: number | null = null;
  try {
    const val = await redis.get(GENEALOGY_WORKER_HEARTBEAT_KEY);
    lastHeartbeat = val ? Number.parseInt(val, 10) : null;
  } finally {
    await redis.quit();
  }

  const online = lastHeartbeat !== null && Date.now() - lastHeartbeat < 120_000;
  return { online, lastHeartbeat, queue };
}
