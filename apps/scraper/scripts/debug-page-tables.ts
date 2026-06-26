#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';

const mod = process.argv[2] ?? 'cash_ledger';
const config = getModuleConfig(mod)!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'networkidle' }).catch(() =>
    page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' }),
  );
  await jitteredDelay(cfg.scraperDelayMs);

  const before = await page.evaluate(() => ({
    title: document.title,
    selects: [...document.querySelectorAll('select')].map((s) => ({ id: s.id, n: s.options.length })),
    buttons: [...document.querySelectorAll('input[type=submit],input[type=button],button')].map((b) => ({
      id: (b as HTMLElement).id,
      value: (b as HTMLInputElement).value || (b as HTMLButtonElement).textContent?.trim(),
    })),
    tables: document.querySelectorAll('table').length,
    gridViews: [...document.querySelectorAll('[id*=GridView]')].map((e) => e.tagName + '#' + e.id),
  }));

  const branch = page.locator('#ContentPlaceHolder1_DropDownList1').first();
  if ((await branch.count()) > 0) {
    const val = await branch.evaluate((el) => {
      const opts = [...(el as HTMLSelectElement).options].filter((o) => o.value && o.value !== '0');
      return opts[0]?.value ?? '';
    });
    if (val) await branch.selectOption(val);
    await page.waitForTimeout(2000);
  }

  const payoutSel = '#ContentPlaceHolder1_DropDownList1, #ContentPlaceHolder1_PayoutDropDownList';
  if (mod === 'income_details') {
    const payout = page.locator(payoutSel).first();
    if ((await payout.count()) > 0) {
      const val = await payout.evaluate((el) => {
        const opts = [...(el as HTMLSelectElement).options].filter((o) => o.value && o.value !== '0');
        return opts[0]?.value ?? '';
      });
      if (val) await payout.selectOption(val);
      await page.waitForTimeout(2000);
    }
  }

  const showSelectors = [
    '#ContentPlaceHolder1_btnShow',
    '#ContentPlaceHolder1_btnSearch',
    'input[value*="Show" i]',
    'input[value*="Search" i]',
  ];
  let clicked = '';
  for (const sel of showSelectors) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
      await btn.click();
      clicked = sel;
      break;
    }
  }

  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(4000);

  const after = await page.evaluate(() => ({
    tables: [...document.querySelectorAll('table')].map((t) => ({
      id: t.id,
      trs: t.querySelectorAll('tr').length,
      head: [...t.querySelectorAll('tr')].slice(0, 2).map((tr) =>
        [...tr.querySelectorAll('th,td')].map((c) => (c.textContent || '').trim().slice(0, 25)),
      ),
    })),
    gridViews: [...document.querySelectorAll('[id*=GridView]')].map((e) => ({
      tag: e.tagName,
      id: e.id,
      childTrs: e.querySelectorAll('tr').length,
    })),
    bodySnippet: document.body.innerText.slice(0, 800),
  }));

  console.log(JSON.stringify({ mod, before, clicked, after }, null, 2));
});

await session.close();
