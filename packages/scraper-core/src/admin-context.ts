import type { Page } from 'playwright';
import { adminUrl, createLogger, loadConfig } from '@greencity/shared';
import { SessionManager } from './session-manager.js';

const log = createLogger('admin-context');

const BP_LIST_URL = '/membermanagement/AdminMemberList.aspx';

export function isAdminContextEnabled(): boolean {
  return process.env.SCRAPER_ADMIN_CONTEXT === 'true';
}

/**
 * Long-lived admin session per worker. Set SCRAPER_ADMIN_CONTEXT=true to enable.
 */
export class AdminContextManager {
  private static instance: AdminContextManager | undefined;
  private session: SessionManager;
  private adminPage: Page | null = null;
  private initPromise: Promise<Page> | null = null;
  private lastRefresh = 0;
  private readonly refreshIntervalMs = 15 * 60 * 1000;

  private constructor() {
    this.session = new SessionManager();
  }

  static getInstance(): AdminContextManager {
    if (!AdminContextManager.instance) {
      AdminContextManager.instance = new AdminContextManager();
    }
    return AdminContextManager.instance;
  }

  async getAdminPage(): Promise<Page> {
    if (this.adminPage && !this.adminPage.isClosed()) {
      await this.refreshIfStale();
      return this.adminPage;
    }
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initAdminPage();
    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async initAdminPage(): Promise<Page> {
    await this.session.ensureDirs();
    const context = await this.session.createContext('admin');
    const page = await context.newPage();
    const url = adminUrl(loadConfig().erpBaseUrl, BP_LIST_URL);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (this.session.isLoginPage(page.url()) || (await page.locator('input[type="password"]').count()) > 0) {
      await this.session.loginAdmin(page);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    this.adminPage = page;
    this.lastRefresh = Date.now();
    log.info('Admin context initialized');
    return page;
  }

  private async refreshIfStale(): Promise<void> {
    if (!this.adminPage || this.adminPage.isClosed()) return;
    if (Date.now() - this.lastRefresh < this.refreshIntervalMs) return;
    const cfg = loadConfig();
    const url = adminUrl(cfg.erpBaseUrl, BP_LIST_URL);
    await this.adminPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
    if (
      this.session.isLoginPage(this.adminPage.url()) ||
      (await this.adminPage.locator('input[type="password"]').count()) > 0
    ) {
      await this.session.loginAdmin(this.adminPage);
      await this.adminPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    this.lastRefresh = Date.now();
    log.info('Admin context refreshed');
  }

  getSession(): SessionManager {
    return this.session;
  }

  async recover(): Promise<Page> {
    if (this.adminPage && !this.adminPage.isClosed()) {
      await this.adminPage.context().close().catch(() => undefined);
    }
    this.adminPage = null;
    return this.getAdminPage();
  }

  async shutdown(): Promise<void> {
    if (this.adminPage && !this.adminPage.isClosed()) {
      await this.adminPage.close().catch(() => undefined);
      await this.adminPage.context().close().catch(() => undefined);
    }
    this.adminPage = null;
    await this.session.close();
    log.info('Admin context shut down');
  }
}

export async function shutdownAdminContext(): Promise<void> {
  if (!isAdminContextEnabled()) return;
  await AdminContextManager.getInstance().shutdown().catch(() => undefined);
}
