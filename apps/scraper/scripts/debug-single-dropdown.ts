#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';
import { extractGridFromDom } from '../src/extractors/dom-grid.js';

const mod = process.argv[2] ?? 'cash_ledger';
const pickValue = process.argv[3]; // optional: select this dropdown value only

const config = getModuleConfig(mod)!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

const dropdownSel =
  mod === 'cash_ledger'
    ? '#ContentPlaceHolder1_DropDownList1'
    : '#ContentPlaceHolder1_DropDownList1, #ContentPlaceHolder1_PayoutDropDownList';

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
  await jitteredDelay(cfg.scraperDelayMs);

  const dropdowns = await page.evaluate((sel) => {
    const el = document.querySelector(sel.split(',')[0].trim()) as HTMLSelectElement | null;
    if (!el) return { error: 'no dropdown', sel };
    return {
      id: el.id,
      count: el.options.length,
      options: [...el.options].map((o) => ({ v: o.value, t: (o.textContent || '').trim().slice(0, 50) })),
    };
  }, dropdownSel);

  const value = pickValue ?? dropdowns.options?.find((o) => o.v && o.v !== '0')?.v;
  if (!value) {
    console.log(JSON.stringify({ mod, dropdowns, error: 'no option to select' }, null, 2));
    return;
  }

  await page.locator(dropdownSel.split(',')[0].trim()).first().selectOption(value);
  await page.waitForTimeout(1000);

  const showBtn = page
    .locator(
      'input[type="submit"][value*="Show" i], input[value*="Search" i], #ContentPlaceHolder1_btnShow, #ContentPlaceHolder1_btnSearch',
    )
    .first();
  const hasShow = (await showBtn.count()) > 0;
  if (hasShow) {
    await showBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  }

  const tables = await page.evaluate(() =>
    [...document.querySelectorAll('table[id*="GridView"], table[id*="grd"]')].map((t) => ({
      id: t.id,
      trs: t.querySelectorAll('tr').length,
    })),
  );

  const dom = await extractGridFromDom(page, config);
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 500));

  console.log(
    JSON.stringify(
      {
        mod,
        selected: value,
        dropdowns,
        hasShow,
        tables,
        domRows: dom.rows.length,
        headers: dom.headers.slice(0, 10),
        sample: dom.rows[0],
        pageSnippet: pageText.replace(/\s+/g, ' ').slice(0, 200),
      },
      null,
      2,
    ),
  );
});

await session.close();
