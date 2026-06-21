/**
 * Ramp genealogy worker concurrency and measure BP/min on a sample set.
 * Usage:
 *   GENEALOGY_BENCHMARK_LEVELS=25,50,75,100 GENEALOGY_BENCHMARK_MAX=50 \
 *     pnpm --filter @greencity/scraper benchmark:concurrency
 */
import { createLogger, loadConfig } from '@greencity/shared';
import { disconnectPrisma, getBpListEntriesForGenealogy } from '@greencity/db';
import { BrowserPool, SessionManager } from '@greencity/scraper-core';
import { runGenealogyBpJob } from './genealogy-runner.js';

const log = createLogger('benchmark-concurrency');

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<{ completed: number; failed: number; elapsedMs: number }> {
  const queue = [...items];
  let completed = 0;
  let failed = 0;
  const start = Date.now();

  async function runWorker(): Promise<void> {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      try {
        await worker(item);
        completed++;
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return { completed, failed, elapsedMs: Date.now() - start };
}

async function main(): Promise<void> {
  loadConfig();
  const levelsRaw = process.env.GENEALOGY_BENCHMARK_LEVELS ?? '25,50,75,100';
  const levels = levelsRaw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const max = Number.parseInt(process.env.GENEALOGY_BENCHMARK_MAX ?? '50', 10);
  const rawBps = process.env.GENEALOGY_BENCHMARK_BPS;
  let bps = await getBpListEntriesForGenealogy();
  if (rawBps) {
    const codes = new Set(rawBps.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    bps = bps.filter((b) => codes.has(b.bpCode.toLowerCase()));
  }
  bps = bps.slice(0, max);
  if (bps.length === 0) throw new Error('No BPs for concurrency benchmark');

  const session = new SessionManager();
  const results: Array<{
    concurrency: number;
    completed: number;
    failed: number;
    elapsedMs: number;
    bpPerMin: number;
    failRate: number;
  }> = [];

  try {
    for (const concurrency of levels) {
      log.info({ concurrency, sampleSize: bps.length }, 'Starting concurrency level');
      process.env.GENEALOGY_CONCURRENCY = String(concurrency);
      const sample = bps.map((bp) => ({ ...bp }));
      const outcome = await runPool(sample, concurrency, async (bp) => {
        await runGenealogyBpJob({
          moduleKey: 'genealogy_bp',
          bpCode: bp.bpCode,
          bpName: bp.bpName,
          uid: bp.uid,
          password: bp.password,
        });
      });
      const bpPerMin = outcome.completed / Math.max(outcome.elapsedMs / 60_000, 1 / 60_000);
      const failRate = outcome.failed / Math.max(sample.length, 1);
      results.push({
        concurrency,
        completed: outcome.completed,
        failed: outcome.failed,
        elapsedMs: outcome.elapsedMs,
        bpPerMin: Math.round(bpPerMin * 10) / 10,
        failRate: Math.round(failRate * 1000) / 1000,
      });
      log.info({ concurrency, ...outcome, bpPerMin: results.at(-1)!.bpPerMin }, 'Concurrency level done');
    }
  } finally {
    await session.close();
    await BrowserPool.getInstance().shutdown().catch(() => undefined);
  }

  const best = [...results].sort((a, b) => b.bpPerMin - a.bpPerMin)[0];
  console.log(
    JSON.stringify(
      {
        sampleSize: bps.length,
        levels: results,
        recommendedConcurrency: best?.concurrency ?? null,
        note: 'Pick highest bpPerMin with failRate near 0. Scale horizontally beyond single-host browser limits.',
      },
      null,
      2,
    ),
  );
  await disconnectPrisma();
}

main().catch((err) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, 'Concurrency benchmark failed');
  process.exit(1);
});
