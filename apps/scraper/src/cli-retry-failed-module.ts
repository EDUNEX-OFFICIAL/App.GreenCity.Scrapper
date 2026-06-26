/**
 * Retry failed pages for a single admin module until gate passes or max rounds.
 * Usage: node apps/scraper/dist/cli-retry-failed-module.js <moduleKey>
 */
import { getPrisma, countFailedRows, getFailedPageRefs } from '@greencity/db';
import { getModuleConfig } from '@greencity/shared';
import { checkModuleGate, retryFailedPagesForModule, runAdminModuleWithGate } from './admin-module-retry.js';

async function main(): Promise<void> {
  const moduleKey = process.argv[2]?.trim();
  if (!moduleKey) {
    console.error('Usage: cli-retry-failed-module.js <moduleKey>');
    process.exit(1);
  }

  const config = getModuleConfig(moduleKey);
  if (!config) {
    console.error('Unknown module:', moduleKey);
    process.exit(1);
  }

  const prisma = getPrisma();
  const failedBefore = await countFailedRows(moduleKey);
  const pagesBefore = await getFailedPageRefs(moduleKey);
  console.log('Module:', moduleKey, '| failed rows:', failedBefore, '| failed pages:', pagesBefore);

  const run = await prisma.scrapeRun.create({
    data: {
      moduleKey,
      portal: 'admin',
      status: 'pending',
      metadata: { triggeredBy: 'retry_failed_module', failedBefore, pagesBefore },
    },
  });

  if (pagesBefore.length > 0 && failedBefore === pagesBefore.length) {
    const retried = await retryFailedPagesForModule(moduleKey, run.id, pagesBefore);
    console.log('Retried pages:', retried);
    const gate = await checkModuleGate(moduleKey, run.id);
    if (gate.passed) {
      await prisma.scrapeRun.update({
        where: { id: run.id },
        data: { status: 'completed', finishedAt: new Date() },
      });
      console.log('PASS after page retries');
      return;
    }
  }

  const passed = await runAdminModuleWithGate(moduleKey, run.id);
  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      status: passed ? 'completed' : 'failed',
      finishedAt: new Date(),
      error: passed ? null : 'Module gate failed after retries',
    },
  });

  const failedAfter = await countFailedRows(moduleKey);
  console.log('Failed rows after:', failedAfter);
  if (!passed) process.exit(1);
  console.log('PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
