import type { Page } from 'playwright';
import {
  createLogger,
  jitteredDelay,
  loadConfig,
  mergeSelectors,
  type ExtractOptions,
  type ExtractResult,
  type ModuleConfig,
} from '@greencity/shared';
import type { SessionManager } from '../session/manager.js';
import { triggerPostBack } from '../webforms/playwright.js';
import {
  advanceToGridPage,
  extractGridFromDom,
  goToNextGridPage,
  isGarbageGrid,
  isPagingComplete,
  readInlineGridPaging,
  readPagingFromDom,
} from './dom-grid.js';
import { extractWithDropdownIterate } from './dropdown-iterate.js';
import { applyPreActions } from './pre-actions.js';
import { extractFormFields, extractAttachmentMetadata, followDetailLinks } from './detail-chain.js';
import { tryExportAndParse } from './export-xlsx.js';

const log = createLogger('grid');

export async function extractGrid(
  page: Page,
  config: ModuleConfig,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  if (!options?.skipPreActions) {
    await applyPreActions(page, config);
  }
  const exportResult = config.extractMode === 'export-first' ? await tryExportAndParse(page, config) : null;
  if (exportResult && exportResult.rows.length > 0) return exportResult;

  const { headers, rows } = await extractGridFromDom(page, config);
  const columnWarnings: string[] = [];
  if (headers.length === 0) columnWarnings.push('No table headers found');
  if (isGarbageGrid(headers, rows)) {
    return {
      rows: [],
      pagesScraped: 1,
      columnWarnings: ['Garbage grid detected (pagination widget?)'],
      usedExport: false,
    };
  }

  let allRows = rows.map((data) => ({ data }));
  if (config.extractMode === 'detail-chain' || config.selectors?.detailLinkColumn) {
    const details = await followDetailLinks(page, config, rows, options);
    allRows = [...allRows, ...details];
  }
  const attachments = await extractAttachmentMetadata(page, config);
  if (attachments.rows.length > 0) allRows = [...allRows, ...attachments.rows];

  return { rows: allRows, pagesScraped: 1, columnWarnings, usedExport: false };
}

export async function extractPaginatedGrid(
  page: Page,
  config: ModuleConfig,
  _session: SessionManager | null,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  const cfg = loadConfig();
  if (!options?.skipPreActions) {
    await applyPreActions(page, config);
  }
  if (config.extractMode === 'export-first') {
    const exportResult = await tryExportAndParse(page, config);
    if (exportResult && exportResult.rows.length > 0) return exportResult;
  }

  const selectors = mergeSelectors(config.selectors);
  const allRows: ExtractResult['rows'] = [];
  const columnWarnings: string[] = [];
  let pagesScraped = 0;
  const pagingMode = config.pagingMode ?? 'auto';
  const maxPages = config.maxPages ?? 10000;
  const streamPages = Boolean(options?.onPage);
  const pageStart = options?.pageStart ?? 1;
  const pageEnd = options?.pageEnd ?? maxPages;
  const maxIter = Math.min(maxPages, Math.max(1, pageEnd));

  if (pagingMode !== 'inline-grid') {
    const viewAll = page.locator(selectors.viewAll).first();
    if ((await viewAll.count()) > 0 && (await viewAll.isVisible().catch(() => false))) {
      await viewAll.click();
      await page.waitForLoadState('domcontentloaded');
      await jitteredDelay(cfg.scraperDelayMs);
      pagesScraped++;
    } else {
      const html = await page.content();
      const viewAllMatch = html.match(/id=["']([^"']*lbtnAll)["']/i);
      if (viewAllMatch) {
        await triggerPostBack(page, viewAllMatch[1].replace(/_/g, '$'));
        await page.waitForLoadState('domcontentloaded');
        await jitteredDelay(cfg.scraperDelayMs);
        pagesScraped++;
      }
    }
  }

  let absolutePage = 1;
  if (pageStart > 1) {
    absolutePage = await advanceToGridPage(page, config, pageStart);
    if (absolutePage >= pageStart) {
      log.info({ pageStart, absolutePage }, 'Resumed at grid page');
    } else {
      log.warn({ pageStart, absolutePage }, 'Could not reach resume page — scraping from current page forward');
    }
  }

  for (let i = 0; i < maxIter; i++) {
    if (absolutePage < pageStart) {
      const paging = await readPagingFromDom(page, config);
      const inline = await readInlineGridPaging(page, config);
      if (isPagingComplete(paging, paging?.end ?? 0, inline, pagingMode)) break;

      let advanced = false;
      if (pagingMode === 'inline-grid' || (pagingMode === 'auto' && inline && !paging)) {
        if (inline?.hasNext) advanced = await goToNextGridPage(page, config, inline);
        if (advanced && inline) absolutePage = inline.currentPage + 1;
      } else if (paging) {
        const pageSize = Math.max(1, paging.end - paging.start + 1);
        const currentPage = Math.ceil(paging.end / pageSize);
        advanced = await goToNextGridPage(page, config, {
          currentPage,
          pageNumbers: inline?.pageNumbers ?? [],
          hasNext: true,
        });
        if (advanced) absolutePage = currentPage + 1;
      }
      if (!advanced) break;
      await jitteredDelay(cfg.scraperDelayMs);
      continue;
    }

    const { headers, rows } = await extractGridFromDom(page, config);
    const pageNum = absolutePage;
    const inRange = pageNum >= pageStart && pageNum <= pageEnd;

    if (i === 0 && headers.length === 0 && pageNum >= pageStart) {
      columnWarnings.push('No table headers found');
    }
    if (headers.length === 0 && inRange && options?.onPageFailed) {
      await options.onPageFailed(pageNum, 'No table headers found');
    }
    if (isGarbageGrid(headers, rows)) {
      columnWarnings.push('Garbage grid detected — skipping page');
      if (inRange && options?.onPageFailed) {
        await options.onPageFailed(pageNum, 'Garbage grid detected — skipping page');
      }
      break;
    }

    if (inRange) {
      if (options?.onPage) {
        await options.onPage(rows, pageNum);
      } else {
        allRows.push(...rows.map((data) => ({ data, sourcePage: pageNum })));
      }
      pagesScraped++;
    }

    if (absolutePage >= pageEnd) break;

    const paging = await readPagingFromDom(page, config);
    const inline = await readInlineGridPaging(page, config);
    if (isPagingComplete(paging, paging?.end ?? rows.length, inline, pagingMode)) break;

    if (pagingMode === 'inline-grid' || (pagingMode === 'auto' && inline && !paging)) {
      if (!inline?.hasNext) break;
      const advanced = await goToNextGridPage(page, config, inline);
      if (!advanced) {
        const failedPage = inline.currentPage + 1;
        if (failedPage >= pageStart && failedPage <= pageEnd && options?.onPageFailed) {
          await options.onPageFailed(failedPage, 'Pagination advance failed');
        }
        break;
      }
      absolutePage = inline.currentPage + 1;
      await jitteredDelay(cfg.scraperDelayMs);
      continue;
    }

    if (!paging) break;

    const pageNumbers = inline?.pageNumbers ?? [];
    const pageSize = Math.max(1, paging.end - paging.start + 1);
    const currentPage = Math.ceil(paging.end / pageSize);
    const advanced = await goToNextGridPage(page, config, {
      currentPage,
      pageNumbers,
      hasNext: true,
    });
    if (!advanced) {
      const failedPage = currentPage + 1;
      if (failedPage >= pageStart && failedPage <= pageEnd && options?.onPageFailed) {
        await options.onPageFailed(failedPage, 'Pagination advance failed');
      }
      break;
    }
    absolutePage = currentPage + 1;
    await jitteredDelay(cfg.scraperDelayMs);
  }

  if (!streamPages && (config.extractMode === 'detail-chain' || config.selectors?.detailLinkColumn)) {
    const parentRows = allRows.map((r) => r.data);
    const details = await followDetailLinks(page, config, parentRows.slice(0, 50), options);
    allRows.push(...details);
  }
  if (!streamPages) {
    const attachments = await extractAttachmentMetadata(page, config);
    allRows.push(...attachments.rows);
  }

  return { rows: streamPages ? [] : allRows, pagesScraped, columnWarnings, usedExport: false };
}

export async function extractReport(
  page: Page,
  config: ModuleConfig,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  const cfg = loadConfig();
  const allRows: ExtractResult['rows'] = [];
  const columnWarnings: string[] = [];
  let pagesScraped = 0;
  const backfill = config.backfill;
  if (!backfill || backfill.type === 'none') {
    return extractPaginatedGrid(page, config, null, options);
  }

  const dates = generateDateRange(backfill.type, backfill.fixedFrom);
  for (const date of dates) {
    await applyDateFilter(page, date, backfill.type);
    await jitteredDelay(cfg.scraperDelayMs);
    const result = await extractPaginatedGrid(page, config, null, options);
    allRows.push(...result.rows.map((r) => ({ ...r, data: { ...r.data, _report_date: date } })));
    columnWarnings.push(...result.columnWarnings);
    pagesScraped += result.pagesScraped;
  }

  return { rows: allRows, pagesScraped, columnWarnings, usedExport: false };
}

async function applyDateFilter(page: Page, date: string, type: string): Promise<void> {
  const dateInput = page
    .locator('input[type="date"], input[id*="Date" i], input[name*="Date" i], input[id*="txtDate" i]')
    .first();
  if (await dateInput.count()) await dateInput.fill(date);

  const monthSelect = page.locator('select[id*="Month" i], select[name*="Month" i]').first();
  if (type === 'monthly' && (await monthSelect.count())) {
    const [y, m] = date.split('-');
    await monthSelect.selectOption(m);
    const yearInput = page.locator('input[id*="Year" i], select[id*="Year" i]').first();
    if (await yearInput.count()) await yearInput.fill(y);
  }

  const searchBtn = page
    .locator('input[type="submit"][value*="Search" i], input[id*="btnSearch" i], button:has-text("Search")')
    .first();
  if (await searchBtn.count()) {
    await searchBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }
}

function generateDateRange(type: string, fixedFrom?: string): string[] {
  const dates: string[] = [];
  const end = new Date();
  const start = fixedFrom ? new Date(fixedFrom) : new Date('2010-01-01');

  if (type === 'daily') {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
  } else if (type === 'monthly') {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  } else if (type === 'yearly') {
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) dates.push(String(y));
  }
  return dates;
}

export async function runExtractor(
  page: Page,
  config: ModuleConfig,
  session: SessionManager,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  const mode = config.extractMode;
  if (config.dropdownIterate) {
    return extractWithDropdownIterate(page, config, session, options);
  }
  if (mode === 'form') {
    await applyPreActions(page, config);
    return extractFormFields(page, config);
  }
  if (mode === 'export-first') {
    await applyPreActions(page, config);
    const exportResult = await tryExportAndParse(page, config);
    if (exportResult && exportResult.rows.length > 0) return exportResult;
  }

  switch (config.tableType) {
    case 'grid':
      return extractGrid(page, config, options);
    case 'paginated-grid':
      if (config.dropdownIterate) {
        return extractWithDropdownIterate(page, config, session, options);
      }
      return extractPaginatedGrid(page, config, session, options);
    case 'report-filter':
      return extractReport(page, config, options);
    default:
      return extractGrid(page, config, options);
  }
}
