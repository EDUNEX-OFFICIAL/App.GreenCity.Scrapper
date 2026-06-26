import type { Page } from 'playwright';
import type { DropdownIterateConfig, ExtractOptions, ExtractResult, ModuleConfig } from '@greencity/shared';
import { jitteredDelay, loadConfig } from '@greencity/shared';
import { dismissModals } from './pre-actions.js';
import { extractFormFields } from './detail-chain.js';
import type { SessionManager } from '../session/manager.js';

async function getExtractPaginatedGrid() {
  const { extractPaginatedGrid } = await import('./grid.js');
  return extractPaginatedGrid;
}

async function getExtractGrid() {
  const { extractGrid } = await import('./grid.js');
  return extractGrid;
}

interface DropdownOption {
  value: string;
  label: string;
}

async function readDropdownOptions(page: Page, selector: string): Promise<DropdownOption[]> {
  return page.evaluate((sel) => {
    const selectors = sel.split(',').map((s) => s.trim());
    let el: HTMLSelectElement | null = null;
    for (const s of selectors) {
      el = document.querySelector(s) as HTMLSelectElement | null;
      if (el) break;
    }
    if (!el) return [];
    return Array.from(el.options)
      .filter((o) => o.value && o.value !== '0' && o.value !== '')
      .map((o) => ({ value: o.value, label: (o.textContent || o.value).trim() }));
  }, selector);
}

async function selectDropdownOption(
  page: Page,
  selector: string,
  value: string,
  waitForOptionsSelector?: string,
): Promise<void> {
  const locator = selector.includes(',')
    ? page.locator(selector).first()
    : page.locator(selector).first();
  await locator.selectOption(value);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  if (waitForOptionsSelector) {
    await page
      .waitForFunction(
        (sel) => {
          const el = document.querySelector(sel) as HTMLSelectElement | null;
          if (!el) return false;
          return Array.from(el.options).some((o) => o.value && o.value !== '0' && o.value !== '');
        },
        waitForOptionsSelector,
        { timeout: 30000 },
      )
      .catch(() => undefined);
  }
}

async function clickSearchButton(page: Page): Promise<void> {
  const searchBtn = page
    .locator(
      'input[type="submit"][value*="Search" i], input[id*="btnSearch" i], input[value*="Show" i], button:has-text("Search"), button:has-text("Show")',
    )
    .first();
  if ((await searchBtn.count()) > 0 && (await searchBtn.isVisible().catch(() => false))) {
    await searchBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page
      .waitForFunction(
        () => {
          for (const table of Array.from(document.querySelectorAll('table[id*="GridView"]'))) {
            for (const tr of Array.from(table.querySelectorAll('tr'))) {
              const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim());
              if (cells.some((c) => /^[A-Z]{1,3}-\d+/.test(c))) return true;
            }
          }
          return false;
        },
        undefined,
        { timeout: 30000 },
      )
      .catch(() => undefined);
  }
}

function injectContext(
  rows: ExtractResult['rows'],
  context: Record<string, string>,
): ExtractResult['rows'] {
  return rows.map((r) => ({ ...r, data: { ...r.data, ...context } }));
}

async function scrapeForDropdownChain(
  page: Page,
  config: ModuleConfig,
  chain: DropdownIterateConfig[],
  chainIndex: number,
  context: Record<string, string>,
  session: SessionManager | null,
  options: ExtractOptions | undefined,
  cfg: ReturnType<typeof loadConfig>,
  extractPaginatedGrid: Awaited<ReturnType<typeof getExtractPaginatedGrid>>,
  extractGrid: Awaited<ReturnType<typeof getExtractGrid>>,
): Promise<ExtractResult> {
  const current = chain[chainIndex]!;
  const isLast = chainIndex === chain.length - 1;
  const valueKey = current.valueKey ?? 'Payout ID';
  const labelKey = current.labelKey ?? 'Payout Label';
  const options_list = await readDropdownOptions(page, current.selector);

  if (options_list.length === 0 && isLast) {
    const shouldSearch = current.searchAfterSelect ?? true;
    if (shouldSearch) {
      await clickSearchButton(page);
      await jitteredDelay(cfg.scraperDelayMs);
    }
    const extractAs = current.extractAs ?? (config.extractMode === 'form' ? 'form' : 'grid');
    const result =
      extractAs === 'form'
        ? await extractFormFields(page, config)
        : await extractGrid(page, config, { ...options, skipPreActions: true });
    return { ...result, rows: injectContext(result.rows, context) };
  }

  if (options_list.length === 0) {
    return { rows: [], pagesScraped: 0, columnWarnings: ['Dropdown had no options'], usedExport: false };
  }

  const merged: ExtractResult = {
    rows: [],
    pagesScraped: 0,
    columnWarnings: [],
    usedExport: false,
  };

  for (const opt of options_list) {
    await selectDropdownOption(page, current.selector, opt.value, current.waitForOptionsSelector);
    await jitteredDelay(cfg.scraperDelayMs);

    const nextContext = {
      ...context,
      [valueKey]: opt.value,
      [labelKey]: opt.label,
    };

    if (!isLast) {
      const nested = await scrapeForDropdownChain(
        page,
        config,
        chain,
        chainIndex + 1,
        nextContext,
        session,
        options,
        cfg,
        extractPaginatedGrid,
        extractGrid,
      );
      merged.rows.push(...nested.rows);
      merged.pagesScraped += nested.pagesScraped;
      merged.columnWarnings.push(...nested.columnWarnings);
      continue;
    }

    const shouldSearch = current.searchAfterSelect ?? true;
    if (shouldSearch) {
      await clickSearchButton(page);
      await jitteredDelay(cfg.scraperDelayMs);
    }

    const extractAs = current.extractAs ?? (config.extractMode === 'form' ? 'form' : 'grid');
    const result =
      extractAs === 'form'
        ? await extractFormFields(page, config)
        : await extractGrid(page, config, { ...options, skipPreActions: true });
    merged.rows.push(...injectContext(result.rows, nextContext));
    merged.pagesScraped += result.pagesScraped;
    merged.columnWarnings.push(...result.columnWarnings);
  }

  return merged;
}

/** Scrape paginated grid for each dropdown option (supports nested dropdown chains). */
export async function extractWithDropdownIterate(
  page: Page,
  config: ModuleConfig,
  session: SessionManager | null,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  const cfg = loadConfig();
  const extractPaginatedGrid = await getExtractPaginatedGrid();
  const extractGrid = await getExtractGrid();
  const chain = Array.isArray(config.dropdownIterate)
    ? config.dropdownIterate
    : config.dropdownIterate
      ? [config.dropdownIterate]
      : [];

  if (chain.length === 0) {
    return extractPaginatedGrid(page, config, session, options);
  }

  await dismissModals(page, config);
  return scrapeForDropdownChain(page, config, chain, 0, {}, session, options, cfg, extractPaginatedGrid, extractGrid);
}
