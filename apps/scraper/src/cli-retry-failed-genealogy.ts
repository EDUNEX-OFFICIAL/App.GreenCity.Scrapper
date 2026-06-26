/**
 * Enqueue a retry-failed-only genealogy batch for BPs missing complete trees.
 * Clears any remaining failed stubs first when present.
 * Usage: node apps/scraper/dist/cli-retry-failed-genealogy.js
 */
import { getPrisma } from '../../../packages/db/dist/client.js';
import {
  deleteGenealogyForBps,
  findActiveGenealogyBatch,
  getFailedGenealogyBpCodes,
  getIncompleteGenealogyBpCodes,
} from '../../../packages/db/dist/genealogy.js';
import { enqueueGenealogyBatch, obliterateGenealogyQueue } from '../../../packages/queue/dist/genealogy-queue.js';
import { stopGenealogyScrape } from '../../../packages/queue/dist/scrape-control.js';

async function main(): Promise<void> {
  const prisma = getPrisma();
  const active = await findActiveGenealogyBatch();
  console.log('Active batch before:', active?.id ?? 'none');

  const stopped = await stopGenealogyScrape();
  console.log('Stopped queue jobs:', stopped.removedJobs);
  await obliterateGenealogyQueue();

  if (active) {
    await prisma.scrapeRun.update({
      where: { id: active.id },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        error: 'Cancelled for admin_panel retry',
      },
    });
  }

  const failedCodes = [...(await getFailedGenealogyBpCodes())];
  if (failedCodes.length > 0) {
    const cleared = await deleteGenealogyForBps(failedCodes);
    console.log('Cleared failed stubs:', failedCodes.length, cleared);
  }

  const retryBps = await getIncompleteGenealogyBpCodes();
  console.log('Incomplete BPs to retry:', retryBps.length);
  if (retryBps.length === 0) {
    console.log('Nothing to retry.');
    return;
  }

  const run = await prisma.scrapeRun.create({
    data: {
      moduleKey: 'genealogy_batch',
      portal: 'bp',
      status: 'pending',
      metadata: {
        triggeredBy: 'retry_failed',
        retryFailedOnly: true,
        totalBps: retryBps.length,
      },
    },
  });

  await enqueueGenealogyBatch({
    moduleKey: 'genealogy_batch',
    runId: run.id,
    triggeredBy: 'retry_failed',
    retryFailedOnly: true,
  });

  console.log('Retry batch enqueued:', run.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
