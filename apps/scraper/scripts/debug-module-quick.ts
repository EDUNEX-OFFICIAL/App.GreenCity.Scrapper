#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';
import { extractWithDropdownIterate } from '../src/extractors/dropdown-iterate.js';
import { extractGridFromDom } from '../src/extractors/dom-grid.js';

const mod = process.argv[2] ?? 'cash_ledger';
const config = getModuleConfig(mod)!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
  await jitteredDelay(cfg.scraperDelayMs);

  const dropdowns = await page.evaluate(() =>
    [...document.querySelectorAll('select')].map((s) => ({
      id: s.id,
      options: [...s.options].slice(0, 5).map((o) => ({ v: o.value, t: (o.textContent || '').trim().slice(0, 40) })),
      count: s.options.length,
    })),
  );

  const result = await extractWithDropdownIterate(page, config, session);
  const dom = await extractGridFromDom(page, config);

  console.log(
    JSON.stringify(
      {
        mod,
        dropdowns,
        dropdownRows: result.rows.length,
        warnings: result.columnWarnings,
        domRows: dom.rows.length,
        headers: dom.headers.slice(0, 8),
        sample: result.rows[0]?.data ?? dom.rows[0],
      },
      null,
      2,
    ),
  );
});

await session.close();
