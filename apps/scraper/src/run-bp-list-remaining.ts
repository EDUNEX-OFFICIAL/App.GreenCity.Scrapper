import { createLogger, loadConfig } from '@greencity/shared';
import { disconnectPrisma } from '@greencity/db';
import { runBpListRemainingChunks } from './bp-list-remaining.js';

const log = createLogger('run-bp-list-remaining');

async function main(): Promise<void> {
  loadConfig();
  log.info('Running BP list chunks B (601-1200) and C (1201+)');
  const ok = await runBpListRemainingChunks();
  log.info({ success: ok }, 'BP list remaining run finished');
  await disconnectPrisma();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  log.error({ err }, 'Fatal error');
  process.exit(1);
});
