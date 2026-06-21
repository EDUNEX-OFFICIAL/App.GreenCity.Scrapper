/**
 * Compare sequential vs parallel sponsor/binary tree scrape wall-clock per BP.
 * Usage: GENEALOGY_BENCHMARK_BPS=bp1,bp2,... tsx src/cli-benchmark-parallel-trees.ts
 */
import { createLogger, loadConfig } from '@greencity/shared';
import { disconnectPrisma, getBpListEntriesForGenealogy } from '@greencity/db';
import { SessionManager } from '@greencity/scraper-core';
import { withBpPanel } from './session/panel.js';
import { scrapeBothGenealogyTrees } from './extractors/genealogy-tree.js';

const log = createLogger('benchmark-parallel-trees');

async function timeBp(
  session: SessionManager,
  bp: { bpCode: string; bpName?: string; uid?: string; password?: string },
  parallel: boolean,
): Promise<number> {
  process.env.GENEALOGY_PARALLEL_TREES = parallel ? 'true' : 'false';
  const start = Date.now();
  await withBpPanel(
    session,
    bp.bpCode,
    async (page) => {
      await scrapeBothGenealogyTrees(page, bp.bpCode);
    },
    { uid: bp.uid, bpName: bp.bpName, password: bp.password },
  );
  return Date.now() - start;
}

async function main(): Promise<void> {
  loadConfig();
  const raw = process.env.GENEALOGY_BENCHMARK_BPS;
  const max = Number.parseInt(process.env.GENEALOGY_BENCHMARK_MAX ?? '5', 10);
  let bps = await getBpListEntriesForGenealogy();
  if (raw) {
    const codes = new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    bps = bps.filter((b) => codes.has(b.bpCode.toLowerCase()));
  }
  bps = bps.slice(0, max);
  if (bps.length === 0) {
    throw new Error('No BPs to benchmark — set GENEALOGY_BENCHMARK_BPS or seed bp_list');
  }

  log.info({ count: bps.length }, 'Benchmarking sequential vs parallel tree scrape');
  const session = new SessionManager();
  const rows: Array<{ bpCode: string; sequentialMs: number; parallelMs: number; savedMs: number }> = [];

  try {
    for (const bp of bps) {
      const sequentialMs = await timeBp(session, bp, false);
      const parallelMs = await timeBp(session, bp, true);
      const savedMs = sequentialMs - parallelMs;
      rows.push({ bpCode: bp.bpCode, sequentialMs, parallelMs, savedMs });
      log.info({ bpCode: bp.bpCode, sequentialMs, parallelMs, savedMs }, 'BP benchmark');
    }
  } finally {
    await session.close();
  }

  const totalSeq = rows.reduce((s, r) => s + r.sequentialMs, 0);
  const totalPar = rows.reduce((s, r) => s + r.parallelMs, 0);
  console.log(
    JSON.stringify(
      {
        bps: rows.length,
        totalSequentialMs: totalSeq,
        totalParallelMs: totalPar,
        totalSavedMs: totalSeq - totalPar,
        avgSequentialMs: Math.round(totalSeq / rows.length),
        avgParallelMs: Math.round(totalPar / rows.length),
        rows,
      },
      null,
      2,
    ),
  );
  await disconnectPrisma();
}

main().catch((err) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, 'Benchmark failed');
  process.exit(1);
});
