import type { Page } from 'playwright';
import type { ModuleConfig } from '@greencity/shared';
import { mergeSelectors, jitteredDelay, loadConfig } from '@greencity/shared';
import { countGridDataRows, readPagingFromDom } from './dom-grid.js';

export async function dismissModals(page: Page, config: ModuleConfig): Promise<void> {
  const selectors = mergeSelectors(config.selectors);
  for (const sel of selectors.dismissModals) {
    const modal = page.locator(sel).first();
    if ((await modal.count()) > 0 && (await modal.isVisible().catch(() => false))) {
      await modal.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(300);
    }
  }

  const openModal = page.locator('.modal.show').first();
  if ((await openModal.count()) > 0) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(300);
    const closeBtn = openModal.locator('button.close, [data-dismiss="modal"]').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => undefined);
    }
  }
}

export async function clickSearchIfNeeded(page: Page, config: ModuleConfig): Promise<boolean> {
  const cfg = loadConfig();
  const rowCount = await countGridDataRows(page, config);
  const paging = await readPagingFromDom(page, config);

  const needsSearch =
    config.tableType === 'paginated-grid' &&
    (config.pagingMode === 'inline-grid' ||
      rowCount <= 1 ||
      !paging ||
      paging.total === 0);

  if (!needsSearch && rowCount > 1) return false;

  const selectors = mergeSelectors(config.selectors);
  const searchBtn = page.locator(selectors.searchButton).first();
  if ((await searchBtn.count()) === 0) return false;
  if (!(await searchBtn.isVisible().catch(() => false))) return false;

  await searchBtn.click();
  await page.waitForLoadState('domcontentloaded');
  await jitteredDelay(cfg.scraperDelayMs);
  return true;
}

export async function applyPreActions(page: Page, config: ModuleConfig): Promise<void> {
  await dismissModals(page, config);
  await clickSearchIfNeeded(page, config);
}
