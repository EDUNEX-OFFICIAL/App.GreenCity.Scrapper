import { describe, expect, it } from 'vitest';
import { updatedAfterSchema } from '../../modules/integration/validators/pagination.validator';

describe('Delta sync validation', () => {
  it('parses updatedAfter ISO timestamp', () => {
    const result = updatedAfterSchema.parse({ updatedAfter: '2026-06-20T10:00:00Z' });
    expect(result.updatedAfter).toBeInstanceOf(Date);
    expect(result.updatedAfter?.toISOString()).toBe('2026-06-20T10:00:00.000Z');
  });

  it('allows missing updatedAfter', () => {
    const result = updatedAfterSchema.parse({});
    expect(result.updatedAfter).toBeUndefined();
  });

  it('rejects invalid datetime', () => {
    expect(() => updatedAfterSchema.parse({ updatedAfter: 'not-a-date' })).toThrow();
  });
});
