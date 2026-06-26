#!/usr/bin/env tsx
import { getModuleConfig, loadConfig, jitteredDelay } from '@greencity/shared';
import { SessionManager } from '../src/session/manager.js';
import { extractGridFromDom } from '../src/extractors/dom-grid.js';

const mod = process.argv[2] ?? 'registered_plot_list';
const projectId = process.argv[3] ?? '1010';
const phaseId = process.argv[4] ?? '13015';

const config = getModuleConfig(mod)!;
const cfg = loadConfig();
const session = new SessionManager();
await session.ensureDirs();

await session.withAdminPage(async (page) => {
  await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, { waitUntil: 'domcontentloaded' });
  await jitteredDelay(cfg.scraperDelayMs);
  await page.selectOption('#ContentPlaceHolder1_ProjectMainDropDownList', projectId);
  await page.waitForTimeout(1500);
  await page.selectOption('#ContentPlaceHolder1_ProjectPhaseDropDownList', phaseId);
  await page.waitForTimeout(500);
  const search = page.locator('#ContentPlaceHolder1_btnSearch, input[value*="Search" i]').first();
  if (await search.count()) await search.click();
  await page.waitForTimeout(2000);
  const dom = await extractGridFromDom(page, config);
  console.log(
    JSON.stringify(
      { mod, projectId, phaseId, headers: dom.headers.slice(0, 8), rows: dom.rows.length, sample: dom.rows[0] },
      null,
      2,
    ),
  );
});

await session.close();
