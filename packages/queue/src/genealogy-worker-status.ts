import { getSharedRedis } from './redis-client.js';
import { getGenealogyQueueCounts } from './genealogy-queue.js';

export const GENEALOGY_WORKER_HEARTBEAT_KEY = 'greencity:genealogy-worker:heartbeat';

export async function setGenealogyWorkerHeartbeat(): Promise<void> {
  const redis = getSharedRedis();
  await redis.set(GENEALOGY_WORKER_HEARTBEAT_KEY, Date.now().toString(), 'EX', 120);
}

export async function getGenealogyWorkerStatus(): Promise<{
  online: boolean;
  lastHeartbeat: number | null;
  queue: { waiting: number; active: number; delayed: number; failed: number; completed: number };
}> {
  const queue = await getGenealogyQueueCounts();
  const redis = getSharedRedis();
  const val = await redis.get(GENEALOGY_WORKER_HEARTBEAT_KEY);
  const lastHeartbeat = val ? Number.parseInt(val, 10) : null;

  const online = lastHeartbeat !== null && Date.now() - lastHeartbeat < 120_000;
  return { online, lastHeartbeat, queue };
}
