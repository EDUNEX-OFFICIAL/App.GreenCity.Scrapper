import type { Page } from 'playwright';
import { bpUrl, loadConfig } from '@greencity/shared';
import {
  GENEALOGY_NAV_TIMEOUT_MS,
  waitForGenealogySubmenu,
  waitForOrgchartReady,
} from './genealogy-waits.js';

export function genealogyTreeUrl(treeType: 'sponsor' | 'binary'): string {
  return treeType === 'binary' ? '/team/TreeBinary.aspx' : '/team/TreeSponsor.aspx';
}

export async function navigateBpSidebar(page: Page, labels: string[]): Promise<void> {
  for (const label of labels) {
    const link = page
      .locator(
        `#sidebar a:has-text("${label}"), .sidebar a:has-text("${label}"), nav a:has-text("${label}"), a:has-text("${label}")`,
      )
      .first();
    await link.waitFor({ state: 'visible', timeout: GENEALOGY_NAV_TIMEOUT_MS });
    await link.click();
    await page.waitForLoadState('domcontentloaded');
    if (/genealogy/i.test(label)) {
      await waitForGenealogySubmenu(page);
    }
  }
}

export async function gotoGenealogyTree(page: Page, treeType: 'sponsor' | 'binary'): Promise<void> {
  const cfg = loadConfig();
  const url = bpUrl(cfg.erpBaseUrl, genealogyTreeUrl(treeType));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('domcontentloaded');

  const orgchart = page.locator('.orgchart, .orgChart, [class*="orgchart"]').first();
  const hasOrgchart =
    (await orgchart.count()) > 0 && (await orgchart.isVisible().catch(() => false));

  if (!hasOrgchart) {
    await navigateBpSidebar(page, ['Genealogy']);
    const submenu =
      treeType === 'binary'
        ? page.locator('a:has-text("Binary Genealogy")').first()
        : page.locator('a:has-text("Sponsor Genealogy")').first();
    if ((await submenu.count()) > 0 && (await submenu.isVisible())) {
      await submenu.click();
      await page.waitForLoadState('domcontentloaded');
      await waitForOrgchartReady(page);
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('domcontentloaded');
    }
  }

  await waitForOrgchartReady(page);
}
