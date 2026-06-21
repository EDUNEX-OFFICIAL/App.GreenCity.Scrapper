import type { Page } from 'playwright';

/**
 * Genealogy hot-path navigation uses selector-based waits instead of SCRAPER_DELAY_MS
 * sleeps. No server-side rate limiting was observed on this portal during audit.
 */
export const GENEALOGY_NAV_TIMEOUT_MS = 30_000;

export const ORGCHART_SELECTOR = '.orgchart, .orgChart, #orgchart, [class*="orgchart"]';

export const GENEALOGY_SUBMENU_SELECTOR =
  'a:has-text("Sponsor Genealogy"), a:has-text("Binary Genealogy")';

/** Orgchart container visible — tree DOM is ready for parse/click. */
export async function waitForOrgchartReady(
  page: Page,
  timeoutMs = GENEALOGY_NAV_TIMEOUT_MS,
): Promise<void> {
  await page
    .locator(ORGCHART_SELECTOR)
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .catch(() => undefined);
}

/** Genealogy sidebar expanded — sponsor/binary submenu links rendered. */
export async function waitForGenealogySubmenu(
  page: Page,
  timeoutMs = GENEALOGY_NAV_TIMEOUT_MS,
): Promise<void> {
  await page
    .locator(GENEALOGY_SUBMENU_SELECTOR)
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .catch(() => undefined);
}

/** Admin BP list grid settled after SEARCH postback (replaces blind post-search sleep). */
export async function waitForBpListGridAfterSearch(
  page: Page,
  timeoutMs = GENEALOGY_NAV_TIMEOUT_MS,
): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page
    .locator('table[id*="GridView"]')
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .catch(() => undefined);
}
