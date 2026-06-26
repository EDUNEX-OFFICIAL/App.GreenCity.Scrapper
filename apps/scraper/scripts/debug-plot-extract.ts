#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadRootEnv(): void {
  if (process.env.DATABASE_URL) return;
  for (const line of readFileSync(resolve(__dirname, '../../../.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadRootEnv();
  const { getModuleConfig, loadConfig, jitteredDelay } = await import('@greencity/shared');
  const { SessionManager } = await import('../src/session/manager.js');
  const { extractGridFromDom, isGarbageGrid } = await import('../src/extractors/dom-grid.js');
  const { extractWithDropdownIterate } = await import('../src/extractors/dropdown-iterate.js');

  const config = getModuleConfig('plot_list')!;
  const cfg = loadConfig();
  const session = new SessionManager();
  await session.ensureDirs();

  await session.withAdminPage(async (page) => {
    await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
    await jitteredDelay(cfg.scraperDelayMs);

    const tables = await page.evaluate(() =>
      Array.from(document.querySelectorAll('table[id*="GridView"], table[id*="grd"]')).map((t) => ({
        id: t.id,
        rows: t.querySelectorAll('tr').length,
      })),
    );
    console.log('tables before:', tables);

    const result = await extractWithDropdownIterate(page, config, session);
    console.log('dropdown result:', {
      rows: result.rows.length,
      pagesScraped: result.pagesScraped,
      warnings: result.columnWarnings,
      sample: result.rows[0]?.data,
    });

    const dom = await extractGridFromDom(page, config);
    console.log('direct dom:', {
      headers: dom.headers.slice(0, 10),
      rowCount: dom.rows.length,
      garbage: isGarbageGrid(dom.headers, dom.rows),
      sample: dom.rows[0],
    });

    const structure = await page.locator('table[id*="GridView"]').first().evaluate((t) => ({
      hasThead: !!t.querySelector('thead'),
      trs: Array.from(t.querySelectorAll('tr')).slice(0, 5).map((tr) => ({
        tag: tr.querySelector('th') ? 'th-row' : 'td-row',
        cells: Array.from(tr.querySelectorAll('th,td')).map((c) => c.textContent?.trim().slice(0, 30)),
      })),
    }));
    console.log('tr structure:', JSON.stringify(structure, null, 2));

    const { extractGridFromDomFn } = await import('../src/extractors/dom-grid.browser.js');
    const raw = await page.locator('table[id*="GridView"]').first().evaluate(extractGridFromDomFn);
    console.log('raw fn rows:', raw.rows.length, raw.headers.slice(0, 5), raw.rows[0]);
  });

  await session.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
