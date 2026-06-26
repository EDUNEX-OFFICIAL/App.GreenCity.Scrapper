/**
 * Exit 0 when genealogy is complete (all bp_list BPs have both trees, zero failed nodes).
 * Usage: node apps/scraper/dist/cli-genealogy-gate.js
 */
import {
  countFailedGenealogyNodes,
  getBpListEntriesForGenealogy,
  getCompletedBpCodes,
  getFailedGenealogyBpCodes,
} from '@greencity/db';

async function main(): Promise<void> {
  const [allBps, completedSet, failedNodes, failedBpCodes] = await Promise.all([
    getBpListEntriesForGenealogy(),
    getCompletedBpCodes(),
    countFailedGenealogyNodes(),
    getFailedGenealogyBpCodes(),
  ]);

  const incomplete = allBps.filter((bp) => !completedSet.has(bp.bpCode.toLowerCase()));

  console.log('Genealogy gate check:');
  console.log('  bp_list entries:', allBps.length);
  console.log('  completed (both trees):', completedSet.size);
  console.log('  incomplete:', incomplete.length);
  console.log('  failed nodes:', failedNodes);
  console.log('  failed BP codes:', failedBpCodes.size);

  const ok = incomplete.length === 0 && failedNodes === 0 && failedBpCodes.size === 0;
  if (!ok) {
    if (incomplete.length > 0) {
      console.log('  sample incomplete:', incomplete.slice(0, 10).map((b) => b.bpCode).join(', '));
    }
    process.exit(1);
  }
  console.log('PASS — genealogy complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
