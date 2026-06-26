#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';
import { extractWithDropdownIterate } from '../src/extractors/dropdown-iterate.js';

const config = getModuleConfig('income_details')!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
  await jitteredDelay(cfg.scraperDelayMs);

  const pageState = await page.evaluate(() => ({
    selects: [...document.querySelectorAll('select')].map((s) => ({
      id: s.id,
      opts: [...s.options].slice(0, 5).map((o) => ({ v: o.value, t: o.textContent?.trim().slice(0, 40) })),
      count: s.options.length,
    })),
    tables: document.querySelectorAll('table').length,
  }));
  console.log('BEFORE:', JSON.stringify(pageState, null, 2));

  const result = await extractWithDropdownIterate(page, config, session);
  console.log(
    JSON.stringify(
      {
        rows: result.rows.length,
        warnings: result.columnWarnings,
        sample: result.rows[0]?.data,
      },
      null,
      2,
    ),
  );
});

await session.close();
