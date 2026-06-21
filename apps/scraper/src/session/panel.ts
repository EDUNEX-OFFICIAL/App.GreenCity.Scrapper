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
  applyResourceBlocking,
  getGenealogyAuthMode,
  isAdminContextEnabled,
  genealogyMetrics,
  waitForBpListGridAfterSearch,
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
  const searchBtn = page.locator(selectors.searchButton ?? 'input[value="SEARCH" i]').first();
  const row = page.locator('table[id*="GridView"] tr').filter({ hasText: bpCode }).first();

  const terms = [bpCode, ...altTerms.filter((t) => t && t !== bpCode)];
  for (const term of terms) {
    if ((await searchInput.count()) === 0) break;
    await searchInput.fill(term);
    if ((await searchBtn.count()) > 0) {
      await searchBtn.click();
      await waitForBpListGridAfterSearch(page);
      try {
        await row.waitFor({ state: 'visible', timeout: 15_000 });
      } catch {
        // Term did not match — try next alt term
      }
    }
    if ((await row.count()) > 0 && (await row.isVisible().catch(() => false))) return true;
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

  const row = adminPage.locator('table[id*="GridView"] tr').filter({ hasText: bpCode }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });

  const settingsInRow = row.locator(selectors.settingsButton ?? '.dropdown-toggle, input[value*="Settings" i]').first();
  if ((await settingsInRow.count()) > 0) {
    await settingsInRow.click();
  } else {
    await row.locator('a, button, input[type="button"], input[type="submit"]').last().click();
  }
  await adminPage.locator('#MemberOpenModal, .modal').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);

  const panelLink = adminPage.locator(selectors.panelMenuItem ?? 'a:has-text("Panel")').first();
  await panelLink.waitFor({ state: 'visible', timeout: 15000 });
  await panelLink.click();

  const modal = adminPage.locator(selectors.memberOpenModal ?? '#MemberOpenModal');
  await modal.waitFor({ state: 'visible', timeout: 30000 });

  const context = adminPage.context();
  const pagePromise = context.waitForEvent('page', { timeout: 30000 }).catch(() => null);

  const clickHere = modal.locator(
    selectors.panelClickHere ?? 'a:has-text("Click Here"), input[value*="Click" i], button:has-text("Click Here")',
  ).first();
  await clickHere.click();

  let bpPage = await pagePromise;
  if (!bpPage) {
    await adminPage.waitForLoadState('domcontentloaded').catch(() => undefined);
    const pages = context.pages();
    bpPage = pages.find((p) => /\/_bp\//i.test(p.url())) ?? pages[pages.length - 1];
  }

  await bpPage.waitForLoadState('domcontentloaded', { timeout: 60000 });
  if (!/\/_bp\//i.test(bpPage.url())) {
    throw new Error(`BP panel did not open for ${bpCode} — got ${bpPage.url()}`);
  }

  const storagePath = bpStoragePath(cfg, bpCode);
  await session.ensureDirs();
  await bpPage.context().storageState({ path: storagePath });
  await upsertBpSession({ bpCode, storageStatePath: storagePath });

  log.info({ bpCode, url: bpPage.url() }, 'BP panel opened via admin Settings → Panel');
  return { bpPage, bpContext: bpPage.context() };
}

export async function openBpPanelViaDirectLogin(
  session: SessionManager,
  bpCode: string,
  password: string,
  bpName?: string,
): Promise<{ bpPage: Page; bpContext: BrowserContext }> {
  return genealogyMetrics.time('login_ms', async () => {
    const cfg = loadConfig();
    await session.ensureDirs();
    const storagePath = bpStoragePath(cfg, bpCode);
    const browser = await session.getBrowser();

    let hasState = false;
    try {
      await access(storagePath);
      hasState = true;
    } catch {
      // no saved session
    }

    const context = await browser.newContext(hasState ? { storageState: storagePath } : {});
    await applyResourceBlocking(context);
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
      await context.close();
      throw new Error(`BP direct login failed for ${bpCode}`);
    }

    if (!/\/_bp\//i.test(page.url())) {
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
    }

    await context.storageState({ path: storagePath });
    await upsertBpSession({ bpCode, bpName, storageStatePath: storagePath, source: 'direct_login' });
    log.info({ bpCode, url: page.url() }, 'BP panel opened via direct login');
    return { bpPage: page, bpContext: context };
  }, { bpCode, method: 'direct_login' });
}

async function withAdminPanelPath<T>(
  session: SessionManager,
  bpCode: string,
  fn: (bpPage: Page) => Promise<T>,
  opts?: { uid?: string; bpName?: string },
): Promise<T> {
  if (isAdminContextEnabled()) {
    const adminCtx = AdminContextManager.getInstance();
    const adminPage = await adminCtx.getAdminPage().catch(async () => adminCtx.recover());
    try {
      const { bpPage } = await openBpPanelFromAdminList(adminCtx.getSession(), adminPage, bpCode, opts);
      try {
        return await fn(bpPage);
      } finally {
        if (!bpPage.isClosed()) await bpPage.close();
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
        if (!bpPage.isClosed()) await bpPage.close();
      }
    },
    { directUrl: BP_LIST_URL },
  );
}

async function withDirectLoginPath<T>(
  session: SessionManager,
  bpCode: string,
  fn: (bpPage: Page) => Promise<T>,
  opts: { uid?: string; bpName?: string; password: string },
): Promise<T> {
  const { bpPage, bpContext } = await openBpPanelViaDirectLogin(session, bpCode, opts.password, opts.bpName);
  try {
    return await fn(bpPage);
  } finally {
    if (!bpPage.isClosed()) await bpPage.close();
    await bpContext.close();
  }
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

  const cached = await tryWithCachedBpSession(session, bpCode, fn, opts);
  if (cached !== null) return cached;

  if (authMode === 'admin_panel') {
    return withAdminPanelPath(session, bpCode, fn, opts);
  }

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
