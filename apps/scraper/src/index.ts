import { createLogger, loadConfig } from '@greencity/shared';
import { disconnectPrisma } from '@greencity/db';
import {
  startWorker,
  seedModuleSchedules,
  enqueueScheduledModules,
  runBackfillOrchestrator,
} from './worker.js';

const log = createLogger('main');

async function main(): Promise<void> {
  loadConfig();
  log.info('Green City ERP scraper starting');

  await seedModuleSchedules();
  const worker = await startWorker();

  const cronIntervalMs = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const hour = new Date().getHours();
      if (hour >= 2 && hour <= 5) {
        const count = await enqueueScheduledModules();
        log.info({ count }, 'Scheduled modules enqueued');
      }
    } catch (err) {
      log.error({ err }, 'Scheduler tick failed');
    }
  }, cronIntervalMs);

  if (process.env.RUN_BACKFILL_ON_START === 'true') {
    const count = await runBackfillOrchestrator();
    log.info({ count }, 'Backfill jobs enqueued');
  }

  const shutdown = async () => {
    log.info('Shutting down');
    await worker.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error({ err }, 'Fatal error');
  process.exit(1);
});
