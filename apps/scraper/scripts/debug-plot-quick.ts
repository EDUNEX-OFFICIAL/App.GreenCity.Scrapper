#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';
import { extractWithDropdownIterate } from '../src/extractors/dropdown-iterate.js';
import { extractGridFromDom, isGarbageGrid } from '../src/extractors/dom-grid.js';

const config = getModuleConfig('plot_list')!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
  await jitteredDelay(cfg.scraperDelayMs);
  const result = await extractWithDropdownIterate(page, config, session);
  const dom = await extractGridFromDom(page, config);
  const tables = await page.evaluate(() =>
    [...document.querySelectorAll('table[id*="GridView"]')].map((t) => ({
      id: t.id,
      trs: t.querySelectorAll('tr').length,
    })),
  );
  const diag = await page.$eval('#ContentPlaceHolder1_GridView1', (table) => {
    const { extractGridFromDomFn } = globalThis as unknown as { extractGridFromDomFn?: (t: Element) => unknown };
    return {
      tag: table.tagName,
      trSample: [...table.querySelectorAll('tr')].slice(0, 6).map((tr) => ({
        cells: [...tr.querySelectorAll('th,td')].map((c) => (c.textContent || '').trim().slice(0, 24)),
      })),
    };
  }).catch((e) => ({ error: String(e) }));
  const { extractGridFromDomFn } = await import('../src/extractors/dom-grid.browser.js');
  const parsed = await page.$eval('#ContentPlaceHolder1_GridView1', extractGridFromDomFn).catch((e) => ({ error: String(e), headers: [], rows: [] }));
  console.log(JSON.stringify({ diag, parsed: { headers: (parsed as {headers?:string[]}).headers?.slice(0,8), rows: (parsed as {rows?:unknown[]}).rows?.length }, ...{ tables, dropdownRows: result.rows.length, domRows: dom.rows.length, garbage: isGarbageGrid(dom.headers, dom.rows), headers: dom.headers.slice(0, 8), warn: result.columnWarnings, sample: result.rows[0]?.data ?? dom.rows[0] } }, null, 2));
});

await session.close();
