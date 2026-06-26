#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';

const mod = process.argv[2] ?? 'cash_ledger';
const config = getModuleConfig(mod)!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
  await jitteredDelay(cfg.scraperDelayMs);

  const clickables = await page.evaluate(() =>
    [...document.querySelectorAll('a, input, button, select')].map((el) => ({
      tag: el.tagName,
      id: (el as HTMLElement).id,
      type: (el as HTMLInputElement).type || '',
      value: (el as HTMLInputElement).value || (el as HTMLAnchorElement).textContent?.trim().slice(0, 30) || '',
      href: (el as HTMLAnchorElement).href?.slice(0, 80) || '',
    })),
  );

  const branch = page.locator('#ContentPlaceHolder1_DropDownList1');
  const branches = await branch.evaluate((el) =>
    [...(el as HTMLSelectElement).options].map((o) => ({ v: o.value, t: o.textContent?.trim() })),
  );

  for (const b of branches.filter((x) => x.v && x.v !== '0')) {
    await branch.selectOption(b.v);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => ({
      branch: (document.querySelector('#ContentPlaceHolder1_DropDownList1') as HTMLSelectElement)?.value,
      tables: [...document.querySelectorAll('table')].map((t) => ({
        id: t.id,
        trs: t.querySelectorAll('tr').length,
        sample: [...t.querySelectorAll('tr')].slice(0, 2).map((tr) =>
          [...tr.querySelectorAll('th,td')].map((c) => (c.textContent || '').trim().slice(0, 20)),
        ),
      })),
      gridHtml: document.querySelector('[id*=GridView]')?.outerHTML?.slice(0, 200) ?? null,
      text: document.body.innerText.match(/Date|Voucher|Debit|Credit|Particular|Cash|Ledger|No record|Empty/i)?.[0] ?? '',
    }));
    console.log(JSON.stringify({ branch: b, state }, null, 2));
  }

  console.log('CLICKABLES:', JSON.stringify(clickables.filter((c) => /show|search|btn|submit|ledger/i.test(c.value + c.id)), null, 2));
});

await session.close();
