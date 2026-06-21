import type { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import { createLogger, loadConfig, type AppConfig } from '@greencity/shared';
import { applyResourceBlocking } from './resource-blocker.js';

const log = createLogger('browser-pool');

export function isBrowserPoolEnabled(): boolean {
  return process.env.SCRAPER_BROWSER_POOL !== 'false';
}

/**
 * Per-worker singleton browser pool: one browser, many contexts/pages.
 * Set SCRAPER_BROWSER_POOL=false to restore per-job browser launch.
 */
export class BrowserPool {
  private static instance: BrowserPool | undefined;
  private config: AppConfig;
  private browser: Browser | null = null;
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private shuttingDown = false;

  private constructor(config?: AppConfig) {
    this.config = config ?? loadConfig();
  }

  static getInstance(config?: AppConfig): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool(config);
    }
    return BrowserPool.instance;
  }

  static resetForTests(): void {
    BrowserPool.instance = undefined;
  }

  async getBrowser(): Promise<Browser> {
    if (this.shuttingDown) {
      throw new Error('BrowserPool is shutting down');
    }
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
    this.browser = await chromium.launch({ headless: this.config.playwrightHeadless });
    this.startHealthCheck();
    log.info('Browser launched');
    return this.browser;
  }

  async newContext(storageStatePath?: string): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const context = await browser.newContext(storageStatePath ? { storageState: storageStatePath } : {});
    await applyResourceBlocking(context);
    return context;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
      log.info('Browser pool shut down');
    }
  }

  private startHealthCheck(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => {
      if (!this.browser || this.browser.isConnected()) return;
      log.warn('Browser disconnected — will relaunch on next acquire');
      this.browser = null;
    }, 30_000);
  }
}

export function registerBrowserPoolShutdown(): void {
  const shutdown = async () => {
    if (BrowserPool.getInstance) {
      await BrowserPool.getInstance().shutdown().catch(() => undefined);
    }
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}
