/**
 * Search-scrape sponsor BP codes referenced in bp_list but missing as rows.
 * Usage: pnpm --filter @greencity/scraper scrape:missing-sponsors
 */
import { getModuleConfig, loadConfig } from '@greencity/shared';
import {
  createScrapeRun,
  disconnectPrisma,
  finishScrapeRun,
  getMissingSponsorBpCodes,
  upsertModuleRows,
} from '@greencity/db';
import { SessionManager } from './session/manager.js';
import { searchBpOnAdminList } from './session/panel.js';
import { extractGridFromDom } from './extractors/dom-grid.js';

async function main(): Promise<void> {
  loadConfig();
  const config = getModuleConfig('bp_list');
  if (!config) throw new Error('bp_list module config not found');

  const missing = await getMissingSponsorBpCodes();
  console.log('Missing sponsor BP codes:', missing.length, missing);

  if (missing.length === 0) {
    console.log('No missing sponsor targets.');
    await disconnectPrisma();
    return;
  }

  const session = new SessionManager();
  const run = await createScrapeRun({
    moduleKey: 'bp_list',
    portal: 'admin',
    metadata: { triggeredBy: 'scrape_missing_sponsors', targets: missing },
  });

  let scraped = 0;
  const failed: string[] = [];

  for (const bpCode of missing) {
    try {
      await session.withAdminPage(async (page) => {
        const ok = await searchBpOnAdminList(page, bpCode, session);
        if (!ok) {
          failed.push(bpCode);
          console.error('Search failed:', bpCode);
          return;
        }

        const grid = await extractGridFromDom(page, config);
        const row = grid.rows.find(
          (r) => r['BP ID']?.trim().toLowerCase() === bpCode.toLowerCase(),
        );
        if (!row) {
          failed.push(bpCode);
          console.error('Grid row not found after search:', bpCode);
          return;
        }

        const upsert = await upsertModuleRows({
          moduleKey: 'bp_list',
          portal: 'admin',
          scrapeRunId: run.id,
          rows: [row],
        });
        scraped += 1;
        console.log('Scraped:', bpCode, 'uid=', row.UID, upsert);
      });
    } catch (err) {
      failed.push(bpCode);
      console.error('Error scraping', bpCode, err);
    }
  }

  await finishScrapeRun(run.id, {
    status: failed.length > 0 ? 'partial' : 'completed',
    rowCount: scraped,
    rowsInserted: scraped,
    rowsUpdated: 0,
    metadata: { scraped, failed, targets: missing },
    error: failed.length > 0 ? `Failed: ${failed.join(', ')}` : undefined,
  });

  await session.close();
  await disconnectPrisma();

  console.log(JSON.stringify({ scraped, failed, runId: run.id }));
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
