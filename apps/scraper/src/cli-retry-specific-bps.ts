/** One-off: retry the 14 BPs that failed in batch cmqoz0mhr0000ot8xp5iqwzmd */
import { getPrisma } from '../../../packages/db/dist/client.js';
import {
  deleteGenealogyForBps,
  findActiveGenealogyBatch,
  getBpListEntriesForGenealogy,
} from '../../../packages/db/dist/genealogy.js';
import { enqueueGenealogyBpJobs, enqueueGenealogyBatch, obliterateGenealogyQueue } from '../../../packages/queue/dist/genealogy-queue.js';
import { stopGenealogyScrape } from '../../../packages/queue/dist/scrape-control.js';

const FAILED_BP_CODES = [
  'D479246', 'D489338', 'D524221', 'Fatma', 'Iftekhar', 'Manish', 'PRADEEP',
  'RA1001', 'RD122741', 'SHARMA', 'Sarika008', 'Sita009', 'Sksuman', 'Vistaar',
];

async function main(): Promise<void> {
  const prisma = getPrisma();
  const active = await findActiveGenealogyBatch();
  if (active) {
    await stopGenealogyScrape();
    await obliterateGenealogyQueue();
    await prisma.scrapeRun.update({
      where: { id: active.id },
      data: { status: 'cancelled', finishedAt: new Date(), error: 'Cancelled for targeted failed retry' },
    });
  }

  const cleared = await deleteGenealogyForBps(FAILED_BP_CODES);
  console.log('Cleared:', cleared);

  const allBps = await getBpListEntriesForGenealogy();
  const failedSet = new Set(FAILED_BP_CODES.map((c) => c.toLowerCase()));
  const retryBps = allBps.filter((bp) => failedSet.has(bp.bpCode.toLowerCase()));
  console.log('Retry BPs:', retryBps.length, retryBps.map((b) => b.bpCode));

  const run = await prisma.scrapeRun.create({
    data: {
      moduleKey: 'genealogy_batch',
      portal: 'bp',
      status: 'running',
      startedAt: new Date(),
      metadata: {
        triggeredBy: 'retry_failed',
        retryFailedOnly: true,
        totalBps: retryBps.length,
        completed: 0,
        failed: 0,
      },
    },
  });

  const enqueued = await enqueueGenealogyBpJobs(run.id, retryBps);
  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: { metadata: { totalBps: retryBps.length, enqueued, completed: 0, failed: 0, retryFailedOnly: true } },
  });
  console.log('Targeted retry batch:', run.id, 'enqueued', enqueued);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
