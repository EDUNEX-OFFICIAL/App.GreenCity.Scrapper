/**
 * Targeted genealogy re-scrape for Vistaar root company (UID 1).
 * Usage: pnpm --filter @greencity/scraper retry:vistaar-root
 */
import { getPrisma, disconnectPrisma } from '@greencity/db';
import {
  deleteGenealogyForUids,
  findActiveGenealogyBatch,
  getBpListEntriesForGenealogy,
} from '@greencity/db';
import { enqueueGenealogyBpJobs, obliterateGenealogyQueue, stopGenealogyScrape } from '@greencity/queue';

const TARGET_BP_CODE = process.env.GENEALOGY_RETRY_BP ?? 'Vistaar';
const TARGET_UID = process.env.GENEALOGY_RETRY_UID ?? '1';

async function main(): Promise<void> {
  const prisma = getPrisma();
  const active = await findActiveGenealogyBatch();
  if (active) {
    await stopGenealogyScrape();
    await obliterateGenealogyQueue();
    await prisma.scrapeRun.update({
      where: { id: active.id },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        error: 'Cancelled for Vistaar root retry',
      },
    });
  }

  const allBps = await getBpListEntriesForGenealogy();
  const target = allBps.find(
    (bp) =>
      bp.uid === TARGET_UID &&
      bp.bpCode.toLowerCase() === TARGET_BP_CODE.toLowerCase(),
  );

  if (!target) {
    throw new Error(
      `Target BP not found in bp_list: bpCode=${TARGET_BP_CODE} uid=${TARGET_UID}. Run scrape:missing-sponsors or full bp_list first.`,
    );
  }

  console.log('Target:', target);

  const cleared = await deleteGenealogyForUids([TARGET_UID]);
  console.log('Cleared genealogy for uid', TARGET_UID, cleared);

  const run = await prisma.scrapeRun.create({
    data: {
      moduleKey: 'genealogy_batch',
      portal: 'bp',
      status: 'running',
      startedAt: new Date(),
      metadata: {
        triggeredBy: 'retry_vistaar_root',
        bpCode: TARGET_BP_CODE,
        uid: TARGET_UID,
        totalBps: 1,
        completed: 0,
        failed: 0,
      },
    },
  });

  const enqueued = await enqueueGenealogyBpJobs(run.id, [target]);
  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      metadata: {
        triggeredBy: 'retry_vistaar_root',
        bpCode: TARGET_BP_CODE,
        uid: TARGET_UID,
        totalBps: 1,
        enqueued,
        completed: 0,
        failed: 0,
      },
    },
  });

  console.log('Vistaar root genealogy batch:', run.id, 'enqueued', enqueued);
  console.log('After batch completes, run: pnpm --filter @greencity/scraper migrate:genealogy-aliases');

  await disconnectPrisma();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
