import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import { adminUrl, createLogger, loadConfig, type AppConfig } from '@greencity/shared';
import { BrowserPool, isBrowserPoolEnabled } from './browser-pool.js';
import { applyResourceBlocking } from './resource-blocker.js';
import { safeCloseContext, safeClosePage } from './browser-resources.js';

const log = createLogger('session');

export type Portal = 'admin';

export class SessionManager {
  private config: AppConfig;
  private browser: Browser | null = null;
  private sessionSuffix?: string;
  private ownsBrowser = true;

  constructor(config?: AppConfig, sessionSuffix?: string) {
    this.config = config ?? loadConfig();
    this.sessionSuffix = sessionSuffix;
    this.ownsBrowser = !isBrowserPoolEnabled();
  }

  async ensureDirs(): Promise<void> {
    await mkdir(this.config.storageStateDir, { recursive: true });
    await mkdir(this.config.failureHtmlDir, { recursive: true });
  }

  storagePath(portal: Portal): string {
    const name = this.sessionSuffix ? `${portal}-${this.sessionSuffix}` : portal;
    return join(this.config.storageStateDir, `${name}.json`);
  }

  async getBrowser(): Promise<Browser> {
    if (isBrowserPoolEnabled()) {
      return BrowserPool.getInstance(this.config).getBrowser();
    }
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.config.playwrightHeadless });
    }
    return this.browser;
  }

  async close(): Promise<void> {
    if (this.ownsBrowser && this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  async hasStorageState(portal: Portal): Promise<boolean> {
    try {
      await access(this.storagePath(portal));
      return true;
    } catch {
      return false;
    }
  }

  async createContext(portal: Portal): Promise<BrowserContext> {
    const path = this.storagePath(portal);
    if (this.sessionSuffix && !(await this.hasStorageState(portal))) {
      const sharedPath = join(this.config.storageStateDir, `${portal}.json`);
      try {
        await access(sharedPath);
        const state = await readFile(sharedPath, 'utf8');
        await writeFile(path, state, 'utf8');
      } catch {
        // no shared session yet
      }
    }
    const hasState = await this.hasStorageState(portal);
    return this.newIsolatedContext(hasState ? path : undefined);
  }

  /** Isolated browser context (admin or BP). Prefer `withIsolatedContext` when possible. */
  async newIsolatedContext(storageStatePath?: string): Promise<BrowserContext> {
    if (isBrowserPoolEnabled()) {
      return BrowserPool.getInstance(this.config).newContext(storageStatePath);
    }
    const browser = await this.getBrowser();
    const context = await browser.newContext(storageStatePath ? { storageState: storageStatePath } : {});
    await applyResourceBlocking(context);
    return context;
  }

  async saveStorageState(context: BrowserContext, portal: Portal): Promise<void> {
    await this.ensureDirs();
    await context.storageState({ path: this.storagePath(portal) });
  }

  isLoginPage(url: string): boolean {
    return /Login\.aspx/i.test(url);
  }

  async ensureAdminSession(page: Page): Promise<void> {
    const homeUrl = adminUrl(this.config.erpBaseUrl, '/home/');
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (this.isLoginPage(page.url()) || (await page.locator('input[type="password"]').count()) > 0) {
      log.info('Admin session expired, re-logging in');
      await this.loginAdmin(page);
    }
  }

  async loginAdmin(page: Page): Promise<void> {
    const loginUrl = adminUrl(this.config.erpBaseUrl, '/Login.aspx');
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const userInput = page.locator('input[type="text"], input[name*="User" i], input[id*="User" i]').first();
    const passInput = page.locator('input[type="password"]').first();
    await userInput.fill(this.config.adminUsername);
    await passInput.fill(this.config.adminPassword);

    const submit = page.locator('input[type="submit"], button[type="submit"], input[value*="Login" i]').first();
    await submit.click();
    await page.waitForLoadState('domcontentloaded');
    await page
      .locator('input[type="password"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 10000 })
      .catch(() => undefined);

    if (this.isLoginPage(page.url())) {
      throw new Error('Admin login failed — still on login page');
    }

    await this.saveStorageState(page.context(), 'admin');
    log.info('Admin login successful');
  }

  async navigateSidebar(page: Page, navPath: string[]): Promise<void> {
    for (const segment of navPath) {
      const link = page
        .locator(`a:has-text("${segment}"), span:has-text("${segment}"), li:has-text("${segment}") a`)
        .first();
      await link.waitFor({ state: 'visible', timeout: 30000 }).catch(async () => {
        const fallback = page.getByText(segment, { exact: false }).first();
        await fallback.click();
      });
      if (await link.isVisible()) {
        await link.click();
      }
      await page.waitForLoadState('domcontentloaded');
      await page.locator('body').waitFor({ state: 'attached', timeout: 5000 }).catch(() => undefined);
    }
  }

  async withIsolatedContext<T>(
    fn: (context: BrowserContext) => Promise<T>,
    storageStatePath?: string,
  ): Promise<T> {
    const context = await this.newIsolatedContext(storageStatePath);
    try {
      return await fn(context);
    } finally {
      await safeCloseContext(context);
    }
  }

  async withAdminPage<T>(
    fn: (page: Page) => Promise<T>,
    opts?: { directUrl?: string },
  ): Promise<T> {
    await this.ensureDirs();
    const context = await this.createContext('admin');
    const page = await context.newPage();
    try {
      if (opts?.directUrl) {
        const url = adminUrl(this.config.erpBaseUrl, opts.directUrl);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (this.isLoginPage(page.url()) || (await page.locator('input[type="password"]').count()) > 0) {
          log.info('Admin session expired, re-logging in');
          await this.loginAdmin(page);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        }
      } else {
        await this.ensureAdminSession(page);
      }
      return await fn(page);
    } finally {
      await safeClosePage(page);
      await safeCloseContext(context);
    }
  }
}

export async function saveFailureHtml(runId: string, html: string, config?: AppConfig): Promise<string> {
  const cfg = config ?? loadConfig();
  await mkdir(cfg.failureHtmlDir, { recursive: true });
  const path = join(cfg.failureHtmlDir, `${runId}.html`);
  await writeFile(path, html, 'utf8');
  return path;
}

export async function loadFailureHtml(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
