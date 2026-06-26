#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';

const config = getModuleConfig('cash_ledger')!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
  await jitteredDelay(cfg.scraperDelayMs);

  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll('input[type=text], textarea')].map((i) => ({
      id: i.id,
      value: (i as HTMLInputElement).value,
    })),
  );

  await page.selectOption('#ContentPlaceHolder1_DropDownList1', 'Muzaffarpur');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(2000);

  const htmlHasGrid = await page.content().then((h) => ({
    hasGridView1: h.includes('GridView1'),
    hasTable: h.includes('<table'),
    len: h.length,
  }));

  const printBtn = page.locator('input[value*="Print" i]').first();
  if ((await printBtn.count()) > 0) {
    await printBtn.click();
    await page.waitForTimeout(3000);
  }

  const afterPrint = await page.evaluate(() => ({
    tables: document.querySelectorAll('table').length,
    grid: document.querySelector('#ContentPlaceHolder1_GridView1')?.outerHTML?.slice(0, 300) ?? null,
    iframes: document.querySelectorAll('iframe').length,
  }));

  console.log(JSON.stringify({ inputs, htmlHasGrid, afterPrint }, null, 2));
});

await session.close();
