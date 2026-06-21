import type { BrowserContext } from 'playwright';
import { createLogger } from '@greencity/shared';

const log = createLogger('resource-blocker');

const BLOCKED_TYPES = new Set(['image', 'font', 'media']);

export function isResourceBlockingEnabled(): boolean {
  return process.env.SCRAPER_BLOCK_RESOURCES === 'true';
}

export async function applyResourceBlocking(context: BrowserContext): Promise<void> {
  if (!isResourceBlockingEnabled()) return;

  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (BLOCKED_TYPES.has(type)) {
      return route.abort();
    }
    return route.continue();
  });
  log.info('Resource blocking enabled (images, fonts, media)');
}
