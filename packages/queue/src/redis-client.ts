import { Redis } from 'ioredis';
import { getRedisConnection } from './connection.js';

let sharedRedis: Redis | undefined;

/** Reuse one Redis connection for lightweight heartbeat reads/writes. */
export function getSharedRedis(): Redis {
  if (!sharedRedis) {
    sharedRedis = new Redis(getRedisConnection() as never, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    sharedRedis.connect().catch(() => undefined);
  }
  return sharedRedis;
}

export async function closeSharedRedis(): Promise<void> {
  if (!sharedRedis) return;
  const redis = sharedRedis;
  sharedRedis = undefined;
  await redis.quit().catch(() => undefined);
}
