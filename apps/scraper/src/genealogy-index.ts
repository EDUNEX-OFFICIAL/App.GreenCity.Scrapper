import { createLogger, loadConfig } from '@greencity/shared';
import { disconnectPrisma } from '@greencity/db';
import { closeSharedRedis } from '@greencity/queue';
import {
  startGenealogyWorker,
  shutdownGenealogyInfrastructure,
  clearGenealogyWorkerTimers,
} from './genealogy-worker.js';
import { startHarvestWorkerIfEnabled } from './harvest-worker.js';

const log = createLogger('genealogy-main');

async function main(): Promise<void> {
  loadConfig();
  log.info('Green City ERP genealogy scraper starting');

  const genealogyWorker = await startGenealogyWorker();
  const harvestWorker = await startHarvestWorkerIfEnabled();

  const shutdown = async () => {
    log.info('Genealogy worker shutting down');
    clearGenealogyWorkerTimers();
    await genealogyWorker.close();
    if (harvestWorker) await harvestWorker.close();
    await shutdownGenealogyInfrastructure();
    await closeSharedRedis();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error({ err }, 'Fatal genealogy worker error');
  process.exit(1);
});
