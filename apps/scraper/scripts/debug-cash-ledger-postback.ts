#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';
import { extractGridFromDom } from '../src/extractors/dom-grid.js';

const mod = process.argv[2] ?? 'cash_ledger';
const branch = process.argv[3] ?? 'Muzaffarpur';

const config = getModuleConfig(mod)!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
  await jitteredDelay(cfg.scraperDelayMs);

  await page.selectOption('#ContentPlaceHolder1_DropDownList1', branch);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3000);

  const afterSelect = await page.evaluate(() => {
    const allInputs = [...document.querySelectorAll('input, button')].map((el) => ({
      id: (el as HTMLElement).id,
      type: (el as HTMLInputElement).type,
      value: (el as HTMLInputElement).value?.slice(0, 30),
      visible: (el as HTMLElement).offsetParent !== null,
    }));
    const tables = [...document.querySelectorAll('table')].map((t) => ({
      id: t.id,
      trs: t.querySelectorAll('tr').length,
      sample: [...t.querySelectorAll('tr')].slice(0, 2).map((tr) =>
        [...tr.querySelectorAll('th,td')].map((c) => (c.textContent || '').trim().slice(0, 20)),
      ),
    }));
    return { allInputs: allInputs.filter((i) => i.id?.includes('ContentPlaceHolder')), tables: tables.filter((t) => t.trs > 1) };
  });

  const dom = await extractGridFromDom(page, config);
  console.log(JSON.stringify({ mod, branch, afterSelect, domRows: dom.rows.length, headers: dom.headers.slice(0, 8), sample: dom.rows[0] }, null, 2));
});

await session.close();
