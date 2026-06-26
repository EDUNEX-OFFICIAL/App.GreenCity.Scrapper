import type { BrowserContext, Page } from 'playwright';
import { createLogger } from '@greencity/shared';
import type { SessionManager } from './session-manager.js';

const log = createLogger('browser-resources');

export async function safeClosePage(page: Page | null | undefined): Promise<void> {
  if (!page || page.isClosed()) return;
  await page.close().catch(() => undefined);
}

export async function safeCloseContext(context: BrowserContext | null | undefined): Promise<void> {
  if (!context) return;
  try {
    if (context.browser() === null) return;
  } catch {
    return;
  }
  await context.close().catch(() => undefined);
}

/** Close tabs opened in `context` after `pagesBefore`, except `keep`. */
export async function closeNewPages(
  context: BrowserContext,
  pagesBefore: ReadonlySet<Page>,
  keep?: Page,
): Promise<void> {
  for (const page of context.pages()) {
    if (pagesBefore.has(page)) continue;
    if (keep && page === keep) continue;
    await safeClosePage(page);
  }
}

export async function withExtraPage<T>(parentPage: Page, fn: (page: Page) => Promise<T>): Promise<T> {
  const extraPage = await parentPage.context().newPage();
  try {
    return await fn(extraPage);
  } finally {
    await safeClosePage(extraPage);
  }
}

/**
 * Acquire an isolated browser context and guarantee close in `finally`.
 * Use this for every short-lived BP/admin scrape context.
 */
export async function withIsolatedContext<T>(
  session: SessionManager,
  fn: (context: BrowserContext) => Promise<T>,
  storageStatePath?: string,
): Promise<T> {
  const context = await session.newIsolatedContext(storageStatePath);
  try {
    return await fn(context);
  } finally {
    await safeCloseContext(context);
  }
}

export function contextLeakThreshold(): number {
  const concurrency = Number.parseInt(process.env.GENEALOGY_CONCURRENCY ?? '50', 10);
  return (Number.isFinite(concurrency) ? concurrency : 50) + 10;
}

export function warnIfContextLeak(count: number): void {
  const threshold = contextLeakThreshold();
  if (count > threshold) {
    log.warn({ openContexts: count, threshold }, 'High number of open browser contexts — possible leak');
  }
}
