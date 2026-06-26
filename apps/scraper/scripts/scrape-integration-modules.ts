#!/usr/bin/env tsx
/**
 * Enqueue scrapes for modules that are empty or under-scraped on the integration API.
 * Usage: pnpm --filter @greencity/scraper scrape:integration-modules [--force]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadRootEnv(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(__dirname, '../../../.env');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const FORCE_ALL_MODULES = [
  'income_by_sale_earning',
  'sale_transactions',
  'bp_income_summary_detail',
  'payout_income_summary',
  'income_details',
  'plot_list',
  'registered_plot_list',
  'govt_survey_plot',
  'branch',
  'master_bank',
  'cash_ledger',
  'neft_list_reward',
  'neft_list_reward_emi',
  'bp_income_details',
  'registry_list',
  'raw_land',
  'accounting_head',
  'bp_payout_mgmt',
  'bp_bulk_payment',
] as const;

const ALWAYS_SCRAPE = [
  'income_by_sale_earning',
  'sale_transactions',
  'income_details',
  'bp_income_summary_detail',
  'payout_income_summary',
] as const;

const PRIORITY_MODULES = [
  'plot_list',
  'registered_plot_list',
  'govt_survey_plot',
  'branch',
  'master_bank',
  'cash_ledger',
  'income_details',
  'neft_list_reward',
  'neft_list_reward_emi',
  'bp_income_details',
  'registry_list',
  'raw_land',
  'accounting_head',
  'bp_payout_mgmt',
  'bp_bulk_payment',
] as const;

const ROW_THRESHOLD = 20;

async function main(): Promise<void> {
  loadRootEnv();
  const forceAll = process.argv.includes('--force');

  const { getPrisma, disconnectPrisma, getAllModuleRowCounts } = await import('@greencity/db');
  const { getModuleConfig } = await import('@greencity/shared');
  const { enqueueScrapeJob } = await import('@greencity/queue');

  const prisma = getPrisma();
  const counts = await getAllModuleRowCounts();

  let toScrape: string[];
  if (forceAll) {
    toScrape = FORCE_ALL_MODULES.filter((key) => getModuleConfig(key));
    // Cancel stuck pending runs that never started
    await prisma.scrapeRun.updateMany({
      where: {
        moduleKey: { in: [...toScrape] },
        status: 'pending',
        startedAt: null,
      },
      data: { status: 'cancelled' },
    });
  } else {
    const thresholdScrape = PRIORITY_MODULES.filter((key) => {
      if (!getModuleConfig(key)) return false;
      return (counts[key] ?? 0) < ROW_THRESHOLD;
    });
    toScrape = [...new Set([...ALWAYS_SCRAPE, ...thresholdScrape])].filter((key) =>
      getModuleConfig(key),
    );
  }

  console.log(JSON.stringify({ counts: Object.fromEntries(toScrape.map((k) => [k, counts[k] ?? 0])) }, null, 2));

  if (toScrape.length === 0) {
    console.log('All priority integration modules meet row threshold.');
    await disconnectPrisma();
    return;
  }

  const runs: Array<{ moduleKey: string; runId: string }> = [];
  for (const moduleKey of toScrape) {
    const run = await prisma.scrapeRun.create({
      data: { moduleKey, portal: 'admin', status: 'pending', metadata: { triggeredBy: 'integration_scrape' } },
    });
    await enqueueScrapeJob({
      moduleKey,
      portal: 'admin',
      runId: run.id,
      triggeredBy: 'integration_scrape',
    });
    runs.push({ moduleKey, runId: run.id });
    console.log(`Queued ${moduleKey} -> ${run.id}`);
  }

  console.log(JSON.stringify({ ok: true, queued: runs.length, runs }, null, 2));
  await disconnectPrisma();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
