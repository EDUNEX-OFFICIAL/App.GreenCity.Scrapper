import type { Page } from 'playwright';
import type { ModuleConfig, PagingMode } from '@greencity/shared';
import { mergeSelectors, loadConfig, jitteredDelay } from '@greencity/shared';
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

  const dataGridHeaders = headers.some((h) =>
    /^(Option|SlNo|SrNo|Name|Point|Plot|Area|Booking|Sale ID|UID|BP ID)/i.test(h.trim()),
  );
  if (dataGridHeaders && rows.length > 0) {
    const hasRealData = rows.some((row) =>
      Object.entries(row).some(
        ([k, v]) => !k.endsWith('_href') && !k.endsWith('_value') && /[a-zA-Z]{2,}/.test(v),
      ),
    );
    if (hasRealData) return false;
  }

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
  const gridSelector = selectors.grid ?? 'table[id*="GridView"]';

  const byId = await page.$('#ContentPlaceHolder1_GridView1');
  if (byId) {
    const direct = await byId.evaluate(extractGridFromDomFn);
    if (direct.rows.length > 0) return direct;
  }

  const grids = page.locator(gridSelector);
  const count = await grids.count();
  let best: DomGridResult = { headers: [], rows: [] };
  for (let i = 0; i < count; i++) {
    const parsed = await grids.nth(i).evaluate(extractGridFromDomFn);
    if (parsed.rows.length > best.rows.length) best = parsed;
  }
  return best;
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

/** Jump to a grid page when the portal pager exposes that page number. */
export async function goToGridPage(
  page: Page,
  config: ModuleConfig,
  targetPage: number,
): Promise<boolean> {
  if (targetPage <= 1) return true;

  const selectors = mergeSelectors(config.selectors);
  const grid = page.locator(selectors.grid).first();
  const pageLink = grid.locator(`a[href*="Page$${targetPage}"]`).first();

  if ((await pageLink.count()) > 0) {
    await pageLink.click();
    await page.waitForLoadState('domcontentloaded');
  } else {
    const html = await page.content();
    const gridTarget =
      html.match(/__doPostBack\(['"](ctl00\$ContentPlaceHolder1\$GridView1)['"]/i)?.[1] ??
      html.match(/__doPostBack\(['"](ctl00\$[^'"]*GridView\d*)['"]/i)?.[1] ??
      'ctl00$ContentPlaceHolder1$GridView1';

    const { triggerGridPage } = await import('../webforms/playwright.js');
    await triggerGridPage(page, gridTarget, targetPage);
    await page.waitForLoadState('domcontentloaded');
  }

  const cfg = loadConfig();
  await jitteredDelay(cfg.scraperDelayMs);

  const detected = await detectCurrentGridPage(page, config);
  return detected >= targetPage - 1;
}

/** Advance pager toward target page using visible page links and >> skips. */
export async function advanceToGridPage(
  page: Page,
  config: ModuleConfig,
  targetPage: number,
): Promise<number> {
  if (targetPage <= 1) return 1;

  const cfg = loadConfig();
  const selectors = mergeSelectors(config.selectors);
  const grid = page.locator(selectors.grid).first();

  let current = await detectCurrentGridPage(page, config);
  if (current >= targetPage) return current;

  const firstHop = Math.min(10, targetPage);
  if (current < firstHop) {
    await goToGridPage(page, config, firstHop);
    current = await detectCurrentGridPage(page, config);
  }

  let guard = 0;
  while (current < targetPage && guard < 500) {
    guard++;
    const inline = await readInlineGridPaging(page, config);
    const pageNumbers = inline?.pageNumbers ?? [];
    const nextVisible = [...pageNumbers].filter((n) => n > current && n <= targetPage).pop();

    if (nextVisible) {
      const link = grid.locator(`a[href*="Page$${nextVisible}"]`).first();
      if ((await link.count()) > 0) {
        await link.click();
        await page.waitForLoadState('domcontentloaded');
        await jitteredDelay(cfg.scraperDelayMs);
        current = await detectCurrentGridPage(page, config);
        continue;
      }
      await goToGridPage(page, config, nextVisible);
      current = await detectCurrentGridPage(page, config);
      continue;
    }

    if (!inline?.hasNext) break;

    const skipLink = grid.locator('a').filter({ hasText: /^>>$/ }).first();
    if ((await skipLink.count()) > 0) {
      await skipLink.click();
      await page.waitForLoadState('domcontentloaded');
      await jitteredDelay(cfg.scraperDelayMs);
      current = await detectCurrentGridPage(page, config);
      continue;
    }

    const advanced = await goToNextGridPage(page, config, inline);
    if (!advanced) break;
    current = await detectCurrentGridPage(page, config);
  }

  return current;
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

/** Infer current 1-based grid page from inline pager, lblPaging, or first SrNo row. */
export async function detectCurrentGridPage(page: Page, config: ModuleConfig): Promise<number> {
  const inline = await readInlineGridPaging(page, config);
  if (inline && inline.currentPage > 0) return inline.currentPage;

  const paging = await readPagingFromDom(page, config);
  if (paging) {
    const pageSize = Math.max(1, paging.end - paging.start + 1);
    return Math.max(1, Math.ceil(paging.end / pageSize));
  }

  const { headers, rows } = await extractGridFromDom(page, config);
  if (rows.length === 0 || headers.length === 0) return 1;

  const srKey =
    headers.find((h) => /^sr\.?\s*no$/i.test(h.trim())) ??
    headers.find((h) => /sr/i.test(h)) ??
    'SrNo';
  const firstSr = Number.parseInt(String(rows[0]?.[srKey] ?? rows[0]?.['Sr No'] ?? '1'), 10);
  if (Number.isFinite(firstSr) && firstSr > 0) {
    return Math.max(1, Math.ceil(firstSr / rows.length));
  }

  return 1;
}
