#!/usr/bin/env tsx
/** Quick diagnostic: plot page dropdown option counts after project/phase select. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadRootEnv(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(__dirname, '../../../.env');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function readOptions(page: import('playwright').Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLSelectElement | null;
    if (!el) return { count: 0, options: [] as string[] };
    const options = Array.from(el.options)
      .filter((o) => o.value && o.value !== '0' && o.value !== '')
      .map((o) => `${o.value}:${(o.textContent || '').trim()}`);
    return { count: options.length, options: options.slice(0, 5) };
  }, selector);
}

async function selectAndWait(page: import('playwright').Page, selector: string, value: string) {
  await page.locator(selector).selectOption(value);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function clickSearch(page: import('playwright').Page) {
  const searchBtn = page.locator('input[type="submit"][value*="Search" i], input[value*="Show" i]').first();
  if (await searchBtn.isVisible().catch(() => false)) {
    await searchBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle').catch(() => undefined);
  }
}

async function logGrid(page: import('playwright').Page) {
  const gridCount = await page.locator('table[id*="GridView"]').count();
  console.log('grid tables:', gridCount);
  if (gridCount === 0) return;
  const headers = await page.locator('table[id*="GridView"]').first().evaluate((t) =>
    Array.from(t.querySelectorAll('th')).map((th) => th.textContent?.trim() ?? ''),
  );
  const rowCount = await page.locator('table[id*="GridView"] tr').count();
  console.log('grid headers:', headers.filter(Boolean).slice(0, 10));
  console.log('grid tr count:', rowCount);
}

async function main(): Promise<void> {
  loadRootEnv();
  const { getModuleConfig, loadConfig, jitteredDelay } = await import('@greencity/shared');
  const { SessionManager } = await import('../src/session/manager.js');

  const modules = ['plot_list', 'registered_plot_list', 'govt_survey_plot', 'cash_ledger', 'income_details', 'registry_list', 'bp_income_details', 'neft_list_reward_emi'] as const;
  const cfg = loadConfig();
  const session = new SessionManager();

  await session.ensureDirs();
  await session.withAdminPage(async (page) => {
    for (const key of modules) {
      const config = getModuleConfig(key);
      if (!config?.directUrl) continue;
      console.log(`\n=== ${key} ===`);
      await page.goto(`${process.env.ERP_BASE_URL}/_admin${config.directUrl}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await jitteredDelay(cfg.scraperDelayMs);
      console.log('title:', await page.title());
      console.log('url:', page.url());

      const projectSel = '#ContentPlaceHolder1_ProjectMainDropDownList';
      const phaseSel = '#ContentPlaceHolder1_ProjectPhaseDropDownList';

      if (await page.locator(projectSel).count()) {
        const projects = await readOptions(page, projectSel);
        console.log('projects:', projects);
        if (projects.count > 0) {
          const first = projects.options[0]?.split(':')[0];
          if (first) {
            await selectAndWait(page, projectSel, first);
            await jitteredDelay(cfg.scraperDelayMs);
            const phases = await readOptions(page, phaseSel);
            console.log('phases after project select:', phases);
            if (phases.count > 0) {
              const phaseVal = phases.options[0]?.split(':')[0];
              if (phaseVal) {
                await selectAndWait(page, phaseSel, phaseVal);
                await jitteredDelay(cfg.scraperDelayMs);
                await clickSearch(page);
                await jitteredDelay(cfg.scraperDelayMs);
                await logGrid(page);
              }
            }
          }
        }
      }

      if (key === 'cash_ledger') {
        console.log('branches:', await readOptions(page, '#ContentPlaceHolder1_DropDownList1'));
        await clickSearch(page);
        await jitteredDelay(cfg.scraperDelayMs);
        await logGrid(page);
      }

      if (key === 'income_details') {
        const payout = await readOptions(page, '#ContentPlaceHolder1_DropDownList1, #ContentPlaceHolder1_PayoutDropDownList');
        console.log('payout dropdown:', payout);
        await logGrid(page);
      }
    }
  });

  await session.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
