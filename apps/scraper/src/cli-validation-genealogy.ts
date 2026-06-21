/**
 * Validation sample run — reports BP/min, failure rate, and speedup vs baseline.
 * Usage: GENEALOGY_VALIDATION_MAX=100 pnpm --filter @greencity/scraper validation:genealogy
 */
import { createLogger, loadConfig } from '@greencity/shared';
import { disconnectPrisma, getBpListEntriesForGenealogy } from '@greencity/db';
import { BrowserPool, SessionManager } from '@greencity/scraper-core';
import { runGenealogyBpJob } from './genealogy-runner.js';

const log = createLogger('validation-genealogy');
const BASELINE_BP_PER_MIN = Number.parseFloat(process.env.GENEALOGY_BASELINE_BP_PER_MIN ?? '20');

async function main(): Promise<void> {
  const cfg = loadConfig();
  const max = Number.parseInt(process.env.GENEALOGY_VALIDATION_MAX ?? '50', 10);
  const concurrency = cfg.genealogyConcurrency;
  let bps = await getBpListEntriesForGenealogy().then((list) => list.slice(0, max));
  if (bps.length === 0) throw new Error('No BPs for validation run');

  const session = new SessionManager();
  const start = Date.now();
  let completed = 0;
  let failed = 0;
  const errors: string[] = [];
  const queue = [...bps];

  async function worker(): Promise<void> {
    for (;;) {
      const bp = queue.shift();
      if (!bp) return;
      try {
        await runGenealogyBpJob({
          moduleKey: 'genealogy_bp',
          bpCode: bp.bpCode,
          bpName: bp.bpName,
          uid: bp.uid,
          password: bp.password,
        });
        completed++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        if (errors.length < 10) errors.push(`${bp.bpCode}: ${message}`);
      }
    }
  }

  log.info({ concurrency, sampleSize: bps.length }, 'Validation run starting');
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    await session.close();
    await BrowserPool.getInstance().shutdown().catch(() => undefined);
  }

  const elapsedMs = Date.now() - start;
  const elapsedMin = Math.max(elapsedMs / 60_000, 1 / 60_000);
  const bpPerMin = completed / elapsedMin;
  const speedup = bpPerMin / BASELINE_BP_PER_MIN;

  const report = {
    sampleSize: bps.length,
    concurrency,
    completed,
    failed,
    failRate: Math.round((failed / bps.length) * 1000) / 1000,
    elapsedMs,
    bpPerMin: Math.round(bpPerMin * 10) / 10,
    baselineBpPerMin: BASELINE_BP_PER_MIN,
    speedupMultiplier: Math.round(speedup * 10) / 10,
    errors,
    infraNote:
      '60 BP/sec is not realistic on a single Playwright host. Scale with N worker containers each at the tuned GENEALOGY_CONCURRENCY.',
  };

  console.log(JSON.stringify(report, null, 2));
  log.info(report, 'Validation run complete');
  await disconnectPrisma();
}

main().catch((err) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, 'Validation failed');
  process.exit(1);
});
