#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';

const modules = ['income_details', 'payout_income_summary', 'neft_list_reward'] as const;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

for (const mod of modules) {
  const config = getModuleConfig(mod)!;
  await session.withAdminPage(async (page) => {
    await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'networkidle' }).catch(() =>
      page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' }),
    );
    await jitteredDelay(cfg.scraperDelayMs);
    const state = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      selects: [...document.querySelectorAll('select')].map((s) => ({
        id: s.id,
        n: s.options.length,
        first: [...s.options].slice(0, 3).map((o) => ({ v: o.value, t: o.textContent?.trim().slice(0, 30) })),
      })),
      tables: [...document.querySelectorAll('table[id*=GridView]')].map((t) => ({ id: t.id, trs: t.querySelectorAll('tr').length })),
      body: document.body.innerText.slice(0, 400),
    }));
    console.log(JSON.stringify({ mod, state }, null, 2));
  });
}

await session.close();
