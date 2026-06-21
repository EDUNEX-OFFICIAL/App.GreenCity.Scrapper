import { createLogger } from '@greencity/shared';

const log = createLogger('scraper-metrics');

export class ScraperMetrics {
  private prefix: string;

  constructor(prefix = 'scraper') {
    this.prefix = prefix;
  }

  timing(name: string, ms: number, extra?: Record<string, unknown>): void {
    log.info({ metric: `${this.prefix}.${name}`, ms, ...extra }, 'timing');
  }

  async time<T>(name: string, fn: () => Promise<T>, extra?: Record<string, unknown>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.timing(name, Date.now() - start, extra);
    }
  }
}

export const genealogyMetrics = new ScraperMetrics('genealogy');
