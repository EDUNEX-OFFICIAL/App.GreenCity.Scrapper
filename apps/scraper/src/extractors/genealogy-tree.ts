import type { Page } from 'playwright';
import {
  createLogger,
  type GenealogyLeg,
  type GenealogyModalData,
  type GenealogyNodeRef,
  type GenealogyScrapeResult,
  type GenealogyTreeType,
} from '@greencity/shared';
import { fetchGenealogyViaHttp, gotoGenealogyTree } from '@greencity/scraper-core';

const log = createLogger('genealogy-tree');

function bpCodesMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Apply wide date range on Binary Genealogy filter bar so full tree loads. */
export async function applyBinaryDateFilters(page: Page): Promise<void> {
  const fromDate = process.env.GENEALOGY_BINARY_FROM ?? '01/01/2010';
  const toDate = process.env.GENEALOGY_BINARY_TO ?? '31/12/2030';
  const dateInputs = page.locator(
    'input[type="text"][class*="date"], input.datepicker, input[id*="date"], input[name*="date"]',
  );
  const count = await dateInputs.count();
  if (count >= 2) {
    await dateInputs.nth(0).fill(fromDate).catch(() => undefined);
    await dateInputs.nth(1).fill(toDate).catch(() => undefined);
  } else if (count === 1) {
    await dateInputs.first().fill(toDate).catch(() => undefined);
  }
  const searchBtn = page
    .locator(
      'button:has-text("Search"), input[type="submit"][value*="Search"], .btn-primary:has(.fa-search), button.btn-primary',
    )
    .first();
  if ((await searchBtn.count()) > 0 && (await searchBtn.isVisible().catch(() => false))) {
    await searchBtn.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page
      .locator('.orgchart, .orgChart, [class*="orgchart"]')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => undefined);
  }
}

export async function waitForOrgchart(page: Page): Promise<void> {
  await page
    .locator('.orgchart, .orgChart, #orgchart, [class*="orgchart"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .catch(() => undefined);
}

export async function parseVisibleTreeNodes(page: Page): Promise<GenealogyNodeRef[]> {
  return page.evaluate(() => {
    const pattern = /\(([A-Za-z0-9_-]+)\)/;
    const nodes: { bpCode: string; bpName?: string; label?: string }[] = [];
    const seen = new Set<string>();
    const selectors = [
      '.orgchart .node',
      '.orgchart td.node',
      '.orgchart .title',
      '.orgchart .content',
      '.tree-node',
      '[class*="orgchart"] .node',
    ];
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text.length < 3 || text.length > 120) continue;
        const match = text.match(pattern);
        if (!match) continue;
        const bpCode = match[1];
        const key = bpCode.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        nodes.push({
          bpCode,
          bpName: text.replace(match[0], '').trim() || undefined,
          label: text,
        });
      }
      if (nodes.length > 0) break;
    }
    if (nodes.length === 0) {
      for (const el of Array.from(document.querySelectorAll('a, span, div, td'))) {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text.length < 4 || text.length > 120) continue;
        const match = text.match(pattern);
        if (!match) continue;
        const bpCode = match[1];
        const key = bpCode.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        nodes.push({ bpCode, bpName: text.replace(match[0], '').trim() || undefined, label: text });
      }
    }
    return nodes;
  });
}

/** Direct children of orgchart root (first level below root node). */
export async function parseDirectChildren(page: Page, rootBpCode: string): Promise<GenealogyNodeRef[]> {
  return page.evaluate((rootCode) => {
    const pattern = /\(([A-Za-z0-9_-]+)\)/;
    const parseEl = (el: Element) => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const match = text.match(pattern);
      if (!match) return null;
      return {
        bpCode: match[1],
        bpName: text.replace(match[0], '').trim() || undefined,
        label: text,
      };
    };
    const orgchart = document.querySelector('.orgchart, .orgChart, [class*="orgchart"]');
    if (!orgchart) return [];
    const allNodes = Array.from(orgchart.querySelectorAll('.node, td.node'));
    let rootEl: Element | null = null;
    for (const el of allNodes) {
      const parsed = parseEl(el);
      if (parsed && parsed.bpCode.toLowerCase() === rootCode.toLowerCase()) {
        rootEl = el;
        break;
      }
    }
    if (!rootEl && allNodes.length > 0) rootEl = allNodes[0];
    if (!rootEl) return [];
    const orgTable = orgchart.querySelector('table') ?? orgchart;
    const rows = Array.from(orgTable.querySelectorAll(':scope > tbody > tr, :scope > tr'));
    let rootRowIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].contains(rootEl)) {
        rootRowIdx = i;
        break;
      }
    }
    const children: { bpCode: string; bpName?: string; label?: string }[] = [];
    const seen = new Set<string>();
    if (rootRowIdx >= 0) {
      for (let i = rootRowIdx + 1; i < rows.length; i++) {
        const rowNodes = rows[i].querySelectorAll('.node, td.node');
        if (rowNodes.length === 0) continue;
        for (const el of Array.from(rowNodes)) {
          const parsed = parseEl(el);
          if (!parsed) continue;
          const key = parsed.bpCode.toLowerCase();
          if (key === rootCode.toLowerCase() || seen.has(key)) continue;
          seen.add(key);
          children.push(parsed);
        }
        if (children.length > 0) break;
      }
    }
    return children;
  }, rootBpCode);
}

export async function parseNodeModal(page: Page): Promise<GenealogyModalData> {
  const raw = await page.evaluate(() => {
    const modal =
      document.querySelector('.modal.show') ??
      document.querySelector('.modal.in') ??
      document.querySelector('.modal[style*="display: block"]') ??
      document.querySelector('[role="dialog"]');
    if (!modal) return { fields: {} as Record<string, string>, statusDate: '', plotStatus: '' };
    const fields: Record<string, string> = {};
    modal.querySelectorAll('table tr').forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('td, th')).map((c) =>
        (c.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      if (cells.length >= 2 && cells[0]) fields[cells[0].replace(/:$/, '')] = cells[1] ?? '';
    });
    let statusDate = '';
    let plotStatus = '';
    const banner = modal.querySelector(
      '.modal-header .label-danger, .modal-header .bg-danger, .modal-header .alert-danger, .modal-header [class*="danger"], .modal-header .badge-danger, .modal-header div[style*="background"]',
    );
    if (banner) {
      const bannerText = (banner.textContent ?? '').replace(/\s+/g, ' ').trim();
      const dateMatch = bannerText.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
      if (dateMatch) statusDate = dateMatch[0];
      plotStatus = bannerText.replace(dateMatch?.[0] ?? '', '').trim();
    }
    return { fields, statusDate, plotStatus };
  });
  const f = raw.fields;
  return {
    position: f.POSITION ?? f.Position,
    leftPoint: f['LEFT POINT'] ?? f['Left Point'],
    rightPoint: f['RIGHT POINT'] ?? f['Right Point'],
    selfPoint: f['SELF POINT'] ?? f['Self Point'],
    sponsorBpId: f['Sponsor ID'] ?? f['Sponsor BP ID'],
    sponsorName: f['Sponsor Name'],
    percentage: f.Percentage,
    totalMembers: f['Total Members'],
    selfBusiness: f['Self Business'],
    totalBusiness: f['Total Business'],
    registeredAt: f['Add On'] ?? f['Registered On'],
    statusDate: raw.statusDate || undefined,
    plotStatus: raw.plotStatus || undefined,
    raw: f,
  };
}

async function clickNodeByBpCode(page: Page, bpCode: string): Promise<boolean> {
  const clicked = await page.evaluate((code) => {
    const pattern = new RegExp(`\\(${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i');
    const selectors = ['.orgchart .node', '.orgchart td.node', '.orgchart .title', 'a', 'span', 'div', 'td'];
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!pattern.test(text)) continue;
        const target = (el.closest('.node') ?? el.closest('a') ?? el) as HTMLElement;
        target.click();
        return true;
      }
    }
    return false;
  }, bpCode);
  if (clicked) {
    await page
      .locator('.modal.show, .modal.in, [role="dialog"]')
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => undefined);
  }
  return clicked;
}

async function closeNodeModal(page: Page): Promise<void> {
  const close = page
    .locator('.modal.show .close, .modal.show button[data-dismiss="modal"], .modal.in .close')
    .first();
  if ((await close.count()) > 0 && (await close.isVisible().catch(() => false))) {
    await close.click({ force: true }).catch(() => undefined);
    await page.locator('.modal.show, .modal.in').first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
  }
}

/**
 * Scrape one BP's snapshot on a tree page: root modal + direct children.
 * Matches Green City Sponsor/Binary Genealogy UI (orgchart + Bootstrap modal).
 */
export async function scrapeGenealogyTree(
  page: Page,
  treeType: GenealogyTreeType,
  rootBpCode: string,
): Promise<GenealogyScrapeResult> {
  const httpResult = await fetchGenealogyViaHttp(rootBpCode, treeType, {});
  if (httpResult) {
    log.info({ treeType, rootBpCode, source: 'http' }, 'Tree snapshot from HTTP harvest');
    return httpResult;
  }

  await gotoGenealogyTree(page, treeType);
  if (treeType === 'binary') {
    await applyBinaryDateFilters(page);
  }
  await waitForOrgchart(page);
  const visible = await parseVisibleTreeNodes(page);
  const rootRef =
    visible.find((n) => bpCodesMatch(n.bpCode, rootBpCode)) ??
    visible[0] ??
    { bpCode: rootBpCode };
  const clicked = await clickNodeByBpCode(page, rootRef.bpCode);
  let modalData: GenealogyModalData = {};
  if (clicked) {
    await page
      .waitForSelector('.modal.show, .modal.in, [role="dialog"]', { timeout: 8000 })
      .catch(() => undefined);
    modalData = await parseNodeModal(page);
    await closeNodeModal(page);
  }
  const children = await parseDirectChildren(page, rootRef.bpCode);
  const fallbackChildren =
    children.length > 0 ? children : visible.filter((n) => !bpCodesMatch(n.bpCode, rootRef.bpCode));
  const result: GenealogyScrapeResult = {
    nodes: [
      {
        bpCode: rootRef.bpCode,
        bpName: rootRef.bpName,
        treeType,
        modalData,
        children: fallbackChildren,
      },
    ],
    edges: fallbackChildren.map((child) => ({
      parentBpCode: rootRef.bpCode,
      childBpCode: child.bpCode,
      treeType,
      leg: inferLeg(modalData.position, treeType),
    })),
  };
  log.info(
    {
      treeType,
      rootBpCode: rootRef.bpCode,
      children: fallbackChildren.length,
      hasModal: !!modalData.position || !!modalData.totalMembers,
    },
    'Tree snapshot scraped',
  );
  return result;
}

function inferLeg(position: string | undefined, treeType: GenealogyTreeType): GenealogyLeg {
  if (!position) return treeType === 'sponsor' ? 'sponsor' : 'unknown';
  const p = position.toLowerCase();
  if (p.includes('left')) return 'left';
  if (p.includes('right')) return 'right';
  if (p.includes('sponsor')) return 'sponsor';
  return treeType === 'sponsor' ? 'sponsor' : 'unknown';
}

function mergeTreeResults(
  sponsor: GenealogyScrapeResult,
  binary: GenealogyScrapeResult,
): GenealogyScrapeResult {
  return {
    nodes: [...sponsor.nodes, ...binary.nodes],
    edges: [...sponsor.edges, ...binary.edges],
  };
}

function isParallelTreesEnabled(): boolean {
  return process.env.GENEALOGY_PARALLEL_TREES !== 'false';
}

async function scrapeBothGenealogyTreesSequential(
  page: Page,
  rootBpCode: string,
): Promise<GenealogyScrapeResult> {
  const sponsor = await scrapeGenealogyTree(page, 'sponsor', rootBpCode);
  const binary = await scrapeGenealogyTree(page, 'binary', rootBpCode);
  return mergeTreeResults(sponsor, binary);
}

/**
 * Sponsor + binary on separate Page tabs in the same BrowserContext (shared cookies).
 * Set GENEALOGY_PARALLEL_TREES=false to fall back to sequential single-page scraping.
 */
async function scrapeBothGenealogyTreesParallel(
  page: Page,
  rootBpCode: string,
): Promise<GenealogyScrapeResult> {
  const context = page.context();
  const binaryPage = await context.newPage();
  try {
    const [sponsor, binary] = await Promise.all([
      scrapeGenealogyTree(page, 'sponsor', rootBpCode),
      scrapeGenealogyTree(binaryPage, 'binary', rootBpCode),
    ]);
    log.info({ rootBpCode, mode: 'parallel' }, 'Both genealogy trees scraped in parallel');
    return mergeTreeResults(sponsor, binary);
  } finally {
    if (!binaryPage.isClosed()) await binaryPage.close();
  }
}

export async function scrapeBothGenealogyTrees(
  page: Page,
  rootBpCode: string,
): Promise<GenealogyScrapeResult> {
  if (isParallelTreesEnabled()) {
    return scrapeBothGenealogyTreesParallel(page, rootBpCode);
  }
  return scrapeBothGenealogyTreesSequential(page, rootBpCode);
}
