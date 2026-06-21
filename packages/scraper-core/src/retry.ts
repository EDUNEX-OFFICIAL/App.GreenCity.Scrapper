import { createLogger } from '@greencity/shared';

const log = createLogger('scraper-retry');

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  label?: string;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const label = opts.label ?? 'operation';
  let lastErr: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i >= attempts) break;
      if (opts.shouldRetry && !opts.shouldRetry(err, i)) break;
      const delay = baseDelayMs * 2 ** (i - 1);
      log.warn(
        { label, attempt: i, attempts, delay, err: err instanceof Error ? err.message : String(err) },
        'Retry after failure',
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
