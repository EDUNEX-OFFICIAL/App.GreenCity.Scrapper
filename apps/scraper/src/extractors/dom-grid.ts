import type { Page } from 'playwright';
import type { ModuleConfig, PagingMode } from '@greencity/shared';
import { mergeSelectors } from '@greencity/shared';
import { extractGridFromDomFn, readInlineGridPagingFn } from './dom-grid.browser.js';

export interface DomGridResult {
  headers: string[];
  rows: Record<string, string>[];
}

export interface InlineGridPaging {
  currentPage: number;
  pageNumbers: number[];
  hasNext: boolean;
}

export function isGarbageGrid(headers: string[], rows: Record<string, string>[]): boolean {
  if (headers.length === 0 && rows.length === 0) return true;

  const numericHeaders = headers.filter((h) => /^\d+$/.test(h.trim()) || h.trim() === '...');
  if (headers.length > 0 && numericHeaders.length >= headers.length * 0.7) return true;

  if (rows.length === 0) return true;

  if (rows.length === 1) {
    const values = Object.values(rows[0]).filter((v) => !v.endsWith('_href') && !v.endsWith('_value'));
    const numericValues = values.filter((v) => /^\d+$/.test(v.trim()) || v.trim() === '...');
    if (values.length > 0 && numericValues.length >= values.length * 0.7) return true;
  }

  const sample = rows.slice(0, 3);
  const hasRealData = sample.some((row) =>
    Object.entries(row).some(
      ([k, v]) => !k.endsWith('_href') && !k.endsWith('_value') && /[a-zA-Z]/.test(v),
    ),
  );
  if (rows.length >= 2 && hasRealData) return false;

  return rows.length === 1 && headers.length > 0 && numericHeaders.length >= headers.length * 0.7;
}

export async function extractGridFromDom(page: Page, config: ModuleConfig): Promise<DomGridResult> {
  const selectors = mergeSelectors(config.selectors);
  const grid = page.locator(selectors.grid).first();

  if ((await grid.count()) === 0) {
    return { headers: [], rows: [] };
  }

  return grid.evaluate(extractGridFromDomFn);
}

export interface PortalPaging {
  start: number;
  end: number;
  total: number;
}

export async function readPagingFromDom(page: Page, config: ModuleConfig): Promise<PortalPaging | null> {
  const selectors = mergeSelectors(config.selectors);
  const label = page.locator(selectors.pagingLabel).first();
  if ((await label.count()) === 0) return null;

  const text = (await label.innerText()).replace(/\s+/g, ' ');
  const withBold = text.match(/Results?\s*(\d+)\s*-\s*(\d+)\s+Of\s+(\d+)/i);
  if (!withBold) return null;

  const start = Number.parseInt(withBold[1], 10);
  const end = Number.parseInt(withBold[2], 10);
  const total = Number.parseInt(withBold[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(total)) return null;
  return { start, end, total };
}

export async function readInlineGridPaging(page: Page, config: ModuleConfig): Promise<InlineGridPaging | null> {
  const selectors = mergeSelectors(config.selectors);
  const grid = page.locator(selectors.grid).first();
  if ((await grid.count()) === 0) return null;

  return grid.evaluate(readInlineGridPagingFn);
}

export function isPagingComplete(
  paging: PortalPaging | null,
  visibleEnd: number,
  inline?: InlineGridPaging | null,
  pagingMode: PagingMode = 'auto',
): boolean {
  if (pagingMode === 'inline-grid') {
    return inline ? !inline.hasNext : false;
  }

  if (paging) {
    if (paging.total <= 0) return true;
    return visibleEnd >= paging.total;
  }

  if (pagingMode === 'lblPaging') return true;

  return inline ? !inline.hasNext : false;
}

export async function getGridPageNumbers(page: Page, config?: ModuleConfig): Promise<number[]> {
  if (config) {
    const inline = await readInlineGridPaging(page, config);
    if (inline && inline.pageNumbers.length > 0) return inline.pageNumbers;
  }

  return page.evaluate(() => {
    const pages = new Set<number>();
    const re = /__doPostBack\([^,]+,\s*['"]Page\$(\d+)['"]\)/gi;
    let match: RegExpExecArray | null;
    const html = document.documentElement.innerHTML;
    while ((match = re.exec(html)) !== null) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > 1) pages.add(n);
    }
    return [...pages].sort((a, b) => a - b);
  });
}

export async function goToNextGridPage(
  page: Page,
  config: ModuleConfig,
  inline: InlineGridPaging,
): Promise<boolean> {
  const selectors = mergeSelectors(config.selectors);
  const grid = page.locator(selectors.grid).first();
  const nextPage = inline.currentPage + 1;

  const nextLink = grid.locator(`a[href*="Page$${nextPage}"]`).first();
  if ((await nextLink.count()) > 0) {
    await nextLink.click();
    await page.waitForLoadState('domcontentloaded');
    return true;
  }

  const skipLink = grid.locator('a').filter({ hasText: /^>>$/ }).first();
  if ((await skipLink.count()) > 0) {
    await skipLink.click();
    await page.waitForLoadState('domcontentloaded');
    return true;
  }

  const html = await page.content();
  const gridTarget =
    html.match(/__doPostBack\(['"](ctl00\$[^'"]*GridView\d*)['"]/i)?.[1] ??
    'ctl00$ContentPlaceHolder1$GridView1';

  try {
    const { triggerGridPage } = await import('../webforms/playwright.js');
    await triggerGridPage(page, gridTarget, nextPage);
    return true;
  } catch {
    const fallback = page.locator(`a[href*="Page$"]`).last();
    if ((await fallback.count()) === 0) return false;
    await fallback.click();
    await page.waitForLoadState('domcontentloaded');
    return true;
  }
}

export async function countGridDataRows(page: Page, config: ModuleConfig): Promise<number> {
  const selectors = mergeSelectors(config.selectors);
  const grid = page.locator(selectors.grid).first();
  if ((await grid.count()) === 0) return 0;
  const { rows } = await extractGridFromDom(page, config);
  return rows.length;
}
