import type { Page, BrowserContext } from 'playwright';
import {
  adminUrl,
  bpUrl,
  createLogger,
  getModuleSelectorOverrides,
  loadConfig,
  type AppConfig,
} from '@greencity/shared';
import { upsertBpSession } from '@greencity/db';
import {
  AdminContextManager,
  closeNewPages,
  findBpListRow,
  getGenealogyAuthMode,
  isAdminContextEnabled,
  genealogyMetrics,
  safeCloseContext,
  safeClosePage,
  waitForBpListGridAfterSearch,
  GENEALOGY_NAV_TIMEOUT_MS,
  withAdminPanelLock,
  type SessionManager,
} from '@greencity/scraper-core';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

export {
  navigateBpSidebar,
  gotoGenealogyTree,
  genealogyTreeUrl,
} from '@greencity/scraper-core';

const log = createLogger('session-panel');

const BP_LIST_URL = '/membermanagement/AdminMemberList.aspx';

export function bpStoragePath(config: AppConfig, bpCode: string): string {
  return join(config.storageStateDir, `bp-${bpCode}.json`);
}

/** Admin BP list defaults to month/fin-year filters — disable so search finds all members. */
async function waitForAdminListStable(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page
    .locator('#ContentPlaceHolder1_SearchTextBox')
    .first()
    .waitFor({ state: 'attached', timeout: GENEALOGY_NAV_TIMEOUT_MS })
    .catch(() => undefined);
  await waitForBpListGridAfterSearch(page);
}

async function safeLocatorCount(page: Page, locator: ReturnType<Page['locator']>): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await locator.count();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Execution context was destroyed') || attempt === 2) throw err;
      await waitForAdminListStable(page);
    }
  }
  return 0;
}

async function clearBpListSearchFilters(page: Page): Promise<void> {
  const fin = page.locator('#ContentPlaceHolder1_FinYearCheckBox').first();
  if ((await safeLocatorCount(page, fin)) > 0 && (await fin.isChecked().catch(() => false))) {
    await fin.click({ noWaitAfter: true });
    await waitForAdminListStable(page);
  }
  const month = page.locator('#ContentPlaceHolder1_MonthCheckBox').first();
  if ((await safeLocatorCount(page, month)) > 0 && (await month.isChecked().catch(() => false))) {
    await month.click({ noWaitAfter: true });
    await waitForAdminListStable(page);
  }
}

async function submitBpListSearch(page: Page, searchInput: ReturnType<Page['locator']>, searchBtn: ReturnType<Page['locator']>): Promise<void> {
  if ((await safeLocatorCount(page, searchBtn)) > 0) {
    await searchBtn.click({ noWaitAfter: true });
  } else {
    await searchInput.press('Enter', { noWaitAfter: true });
  }
  await waitForAdminListStable(page);
}

export async function searchBpOnAdminList(
  page: Page,
  bpCode: string,
  session?: SessionManager,
  altTerms: string[] = [],
): Promise<boolean> {
  const cfg = loadConfig();
  const selectors = getModuleSelectorOverrides('bp_list') ?? {};
  const listUrl = adminUrl(cfg.erpBaseUrl, BP_LIST_URL);
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (session && (session.isLoginPage(page.url()) || (await page.locator('input[type="password"]').count()) > 0)) {
    log.info('Admin session expired on BP list — re-logging in');
    await session.loginAdmin(page);
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  const searchInput = page.locator(selectors.searchInput ?? '#ContentPlaceHolder1_SearchTextBox').first();
  const searchBtn = page.locator('#ContentPlaceHolder1_SearchButton').first();

  await clearBpListSearchFilters(page);

  const uidTerm = altTerms.find((t) => /^\d+$/.test(t.trim()));
  const terms = [...new Set([uidTerm, bpCode, ...altTerms.filter((t) => t && t !== bpCode && t !== uidTerm)])].filter(
    Boolean,
  ) as string[];

  for (const term of terms) {
    if ((await safeLocatorCount(page, searchInput)) === 0) break;
    await searchInput.evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
    }, term);
    await submitBpListSearch(page, searchInput, searchBtn);
    const row = await findBpListRow(page, bpCode);
    if (row && (await row.isVisible().catch(() => false))) return true;
  }
  return false;
}

export async function openBpPanelFromAdminList(
  session: SessionManager,
  adminPage: Page,
  bpCode: string,
  opts?: { uid?: string; bpName?: string },
): Promise<{ bpPage: Page; bpContext: BrowserContext }> {
  const cfg = loadConfig();
  const selectors = getModuleSelectorOverrides('bp_list') ?? {};
  const altTerms = [opts?.uid, opts?.bpName].filter(Boolean) as string[];

  let found = await searchBpOnAdminList(adminPage, bpCode, session, altTerms);
  if (!found) {
    log.warn({ bpCode }, 'BP row not found — renewing admin session and retrying search');
    await session.loginAdmin(adminPage);
    found = await searchBpOnAdminList(adminPage, bpCode, session, altTerms);
  }
  if (!found) {
    throw new Error(`BP ${bpCode} not found on admin list after search`);
  }

  const row = (await findBpListRow(adminPage, bpCode)) ??
    adminPage.locator('table[id*="GridView"] tr').filter({ hasText: bpCode }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });

  const settingsInRow = row.locator(selectors.settingsButton ?? '.dropdown-toggle, input[value*="Settings" i]').first();
  if ((await safeLocatorCount(adminPage, settingsInRow)) > 0) {
    await settingsInRow.hover().catch(() => undefined);
    await settingsInRow.click({ noWaitAfter: true });
  } else {
    await row.locator('a, button, input[type="button"], input[type="submit"]').last().click({ noWaitAfter: true });
  }
  await waitForAdminListStable(adminPage);

  const rowDropdown = row.locator('.dropdown-menu');
  await rowDropdown.waitFor({ state: 'visible', timeout: 15_000 }).catch(async () => {
    await settingsInRow.click({ noWaitAfter: true });
    await waitForAdminListStable(adminPage);
    await rowDropdown.waitFor({ state: 'visible', timeout: 15_000 });
  });

  const panelLink = row.locator('a:has-text("Panel"), .dropdown-item:has-text("Panel")').first();
  await panelLink.waitFor({ state: 'visible', timeout: 15_000 });
  await panelLink.click({ noWaitAfter: true });

  const modal = adminPage.locator(selectors.memberOpenModal ?? '#MemberOpenModal');
  await modal.waitFor({ state: 'visible', timeout: 30000 });

  const context = adminPage.context();
  const pagesBefore = new Set(context.pages());
  const pagePromise = context.waitForEvent('page', { timeout: 30000 }).catch(() => null);

  const clickHere = adminPage.locator(
    selectors.panelClickHere ??
      '#MemberOpenModal a:has-text("Click Here"), #MemberOpenModal input[value*="Click" i], #MemberOpenModal button:has-text("Click Here"), .modal a:has-text("Click Here")',
  ).first();

  let bpPage: Page | null = null;
  try {
    await clickHere.click({ noWaitAfter: true });

    bpPage = await pagePromise;
    if (!bpPage) {
      await adminPage.waitForLoadState('domcontentloaded').catch(() => undefined);
      const pages = context.pages();
      bpPage = pages.find((p) => /\/_bp\//i.test(p.url())) ?? pages[pages.length - 1];
    }

    await bpPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    if (!/\/_bp\//i.test(bpPage.url())) {
      throw new Error(`BP panel did not open for ${bpCode} — got ${bpPage.url()}`);
    }

    const storagePath = bpStoragePath(cfg, bpCode);
    await session.ensureDirs();
    await bpPage.context().storageState({ path: storagePath });
    await upsertBpSession({ bpCode, storageStatePath: storagePath });

    log.info({ bpCode, url: bpPage.url() }, 'BP panel opened via admin Settings → Panel');
    return { bpPage, bpContext: bpPage.context() };
  } catch (err) {
    if (bpPage && !bpPage.isClosed() && bpPage !== adminPage) {
      await safeClosePage(bpPage);
    } else {
      await closeNewPages(context, pagesBefore, adminPage);
    }
    throw err;
  }
}

async function loginBpPageInContext(
  context: BrowserContext,
  bpCode: string,
  password: string,
  bpName: string | undefined,
  storagePath: string,
  hasState: boolean,
): Promise<Page> {
  const cfg = loadConfig();
  const page = await context.newPage();
  const homeUrl = bpUrl(cfg.erpBaseUrl, '/Default.aspx');
  const loginUrl = bpUrl(cfg.erpBaseUrl, '/Login.aspx');

  await page.goto(hasState ? homeUrl : loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (/Login\.aspx/i.test(page.url()) || (await page.locator('input[type="password"]').count()) > 0) {
    const userInput = page
      .locator(
        'input[type="text"], input[name*="User" i], input[id*="User" i], input[id*="Member" i], input[id*="Login" i]',
      )
      .first();
    const passInput = page.locator('input[type="password"]').first();
    await userInput.fill(bpCode);
    await passInput.fill(password);
    await page.locator('input[type="submit"], button[type="submit"], input[value*="Login" i]').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page
      .locator('input[type="password"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 10000 })
      .catch(() => undefined);
  }

  if (/Login\.aspx/i.test(page.url())) {
    throw new Error(`BP direct login failed for ${bpCode}`);
  }

  if (!/\/_bp\//i.test(page.url())) {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
  }

  await context.storageState({ path: storagePath });
  await upsertBpSession({ bpCode, bpName, storageStatePath: storagePath, source: 'direct_login' });
  log.info({ bpCode, url: page.url() }, 'BP panel opened via direct login');
  return page;
}

export async function openBpPanelViaDirectLogin(
  session: SessionManager,
  bpCode: string,
  password: string,
  bpName?: string,
): Promise<{ bpPage: Page; bpContext: BrowserContext }> {
  const cfg = loadConfig();
  await session.ensureDirs();
  const storagePath = bpStoragePath(cfg, bpCode);

  let hasState = false;
  try {
    await access(storagePath);
    hasState = true;
  } catch {
    // no saved session
  }

  const context = await session.newIsolatedContext(hasState ? storagePath : undefined);
  try {
    const bpPage = await loginBpPageInContext(context, bpCode, password, bpName, storagePath, hasState);
    return { bpPage, bpContext: context };
  } catch (err) {
    await safeCloseContext(context);
    throw err;
  }
}

async function withAdminPanelPath<T>(
  session: SessionManager,
  bpCode: string,
  fn: (bpPage: Page) => Promise<T>,
  opts?: { uid?: string; bpName?: string },
): Promise<T> {
  return withAdminPanelLock(async () => {
    if (isAdminContextEnabled()) {
      const adminCtx = AdminContextManager.getInstance();
      const adminPage = await adminCtx.getAdminPage().catch(async () => adminCtx.recover());
      try {
        const { bpPage } = await openBpPanelFromAdminList(adminCtx.getSession(), adminPage, bpCode, opts);
        try {
          return await fn(bpPage);
        } finally {
          await safeClosePage(bpPage);
        }
      } catch (err) {
        log.warn({ bpCode, err: err instanceof Error ? err.message : String(err) }, 'Admin context BP open failed — recovering');
        await adminCtx.recover();
        throw err;
      }
    }

    return session.withAdminPage(
      async (adminPage) => {
        const { bpPage } = await openBpPanelFromAdminList(session, adminPage, bpCode, opts);
        try {
          return await fn(bpPage);
        } finally {
          await safeClosePage(bpPage);
        }
      },
      { directUrl: BP_LIST_URL },
    );
  });
}

async function withDirectLoginPath<T>(
  session: SessionManager,
  bpCode: string,
  fn: (bpPage: Page) => Promise<T>,
  opts: { uid?: string; bpName?: string; password: string },
): Promise<T> {
  const cfg = loadConfig();
  await session.ensureDirs();
  const storagePath = bpStoragePath(cfg, bpCode);

  let hasState = false;
  try {
    await access(storagePath);
    hasState = true;
  } catch {
    // no saved session
  }

  return session.withIsolatedContext(async (context) => {
    const bpPage = await genealogyMetrics.time(
      'login_ms',
      () => loginBpPageInContext(context, bpCode, opts.password, opts.bpName, storagePath, hasState),
      { bpCode, method: 'direct_login' },
    );
    return fn(bpPage);
  }, hasState ? storagePath : undefined);
}

async function tryWithCachedBpSession<T>(
  session: SessionManager,
  bpCode: string,
  fn: (bpPage: Page) => Promise<T>,
  opts?: { uid?: string; bpName?: string; password?: string },
): Promise<T | null> {
  if (!opts?.password) return null;

  const cfg = loadConfig();
  const storagePath = bpStoragePath(cfg, bpCode);
  try {
    await access(storagePath);
  } catch {
    return null;
  }

  try {
    log.info({ bpCode }, 'Using cached BP session storage state');
    return await withDirectLoginPath(session, bpCode, fn, { ...opts, password: opts.password });
  } catch (err) {
    log.warn(
      { bpCode, err: err instanceof Error ? err.message : String(err) },
      'Cached BP session failed — falling back to admin panel',
    );
    return null;
  }
}

export async function withBpPanel<T>(
  session: SessionManager,
  bpCode: string,
  fn: (bpPage: Page) => Promise<T>,
  opts?: { uid?: string; bpName?: string; password?: string },
): Promise<T> {
  const authMode = getGenealogyAuthMode();

  // Admin panel path: Settings → Panel → sidebar Genealogy (no BP password needed).
  if (authMode === 'admin_panel') {
    return withAdminPanelPath(session, bpCode, fn, opts);
  }

  const cached = await tryWithCachedBpSession(session, bpCode, fn, opts);
  if (cached !== null) return cached;

  if (authMode === 'auto') {
    try {
      return await withAdminPanelPath(session, bpCode, fn, opts);
    } catch (adminErr) {
      if (!opts?.password) throw adminErr;
      log.warn(
        { bpCode, err: adminErr instanceof Error ? adminErr.message : String(adminErr) },
        'Admin panel failed — falling back to direct login',
      );
      return withDirectLoginPath(session, bpCode, fn, { ...opts, password: opts.password });
    }
  }

  // direct_login (default legacy): direct first, admin fallback
  if (opts?.password) {
    try {
      return await withDirectLoginPath(session, bpCode, fn, { ...opts, password: opts.password });
    } catch (err) {
      log.warn(
        { bpCode, err: err instanceof Error ? err.message : String(err) },
        'Direct BP login failed — falling back to admin panel',
      );
    }
  }

  return withAdminPanelPath(session, bpCode, fn, opts);
}
