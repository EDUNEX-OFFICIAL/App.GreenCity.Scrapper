import { describe, expect, it } from 'vitest';
import { paginationSchema } from '../../modules/integration/validators/pagination.validator';

describe('Pagination validation', () => {
  it('applies defaults page=1 limit=100', () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
  });

  it('rejects limit above 1000', () => {
    expect(() => paginationSchema.parse({ limit: '1001' })).toThrow();
  });

  it('rejects page below 1', () => {
    expect(() => paginationSchema.parse({ page: '0' })).toThrow();
  });

  it('accepts valid pagination', () => {
    const result = paginationSchema.parse({ page: '2', limit: '50' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });
});
