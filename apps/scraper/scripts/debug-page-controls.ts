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

  const controls = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, button, a')].map((el) => ({
      tag: el.tagName,
      id: (el as HTMLElement).id,
      type: (el as HTMLInputElement).type,
      value: (el as HTMLInputElement).value?.slice(0, 40),
      text: (el.textContent || '').trim().slice(0, 40),
      visible: (el as HTMLElement).offsetParent !== null,
    }));
    const selects = [...document.querySelectorAll('select')].map((s) => ({
      id: s.id,
      opts: s.options.length,
    }));
    return { inputs: inputs.filter((i) => i.visible && (i.value || i.text)), selects };
  });

  console.log(JSON.stringify({ mod, url: config.directUrl, controls }, null, 2));
});

await session.close();
