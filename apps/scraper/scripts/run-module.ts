import { SessionManager } from '../dist/session/manager.js';
import { getModuleConfig } from '@greencity/shared';
import { runExtractor } from '../dist/extractors/grid.js';
import { createScrapeRun, finishScrapeRun, upsertModuleRows } from '@greencity/db';

const moduleKey = process.argv[2] ?? 'master_bank';

async function main() {
  const config = getModuleConfig(moduleKey);
  if (!config) {
    console.error(`Unknown module: ${moduleKey}`);
    process.exit(1);
  }

  const session = new SessionManager();
  const run = await createScrapeRun({ moduleKey, portal: 'admin' });

  await session.withAdminPage(async (page) => {
    await session.navigateSidebar(page, config.navPath);
    const result = await runExtractor(page, config, session);
    const upsert = await upsertModuleRows({
      moduleKey,
      portal: 'admin',
      scrapeRunId: run.id,
      rows: result.rows.map((r) => r.data),
    });

    await finishScrapeRun(run.id, {
      status: 'completed',
      rowCount: result.rows.length,
      rowsInserted: upsert.inserted,
      rowsUpdated: upsert.updated,
    });

    console.log(JSON.stringify({ moduleKey, rows: result.rows.length, upsert, url: page.url() }, null, 2));
  });

  await session.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
