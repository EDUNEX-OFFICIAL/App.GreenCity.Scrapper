import { withRetry } from './retry.js';
import { isTransientPortalError } from './portal-errors.js';

export async function withPortalRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const attempts = Number.parseInt(process.env.GENEALOGY_PORTAL_RETRY_ATTEMPTS ?? '3', 10);
  const baseDelayMs = Number.parseInt(process.env.GENEALOGY_PORTAL_RETRY_MS ?? '2000', 10);

  return withRetry(fn, {
    attempts: Number.isFinite(attempts) ? attempts : 3,
    baseDelayMs: Number.isFinite(baseDelayMs) ? baseDelayMs : 2000,
    label,
    shouldRetry: (err) => isTransientPortalError(err),
  });
}
