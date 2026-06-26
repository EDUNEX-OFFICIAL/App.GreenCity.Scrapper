import { describe, expect, it } from 'vitest';
import {
  bpCodeParamSchema,
  bpDetailQuerySchema,
  bpListQuerySchema,
  uidParamSchema,
} from '../../modules/integration/validators/bp.validator';
import {
  isValidBpCode,
  mapBpCandidate,
  mapBpRow,
  pickCommissionPct,
} from '../../modules/integration/mappers/field-mappers';
import { AppError } from '../../modules/integration/lib/errors';

describe('BP list query', () => {
  it('accepts uid filter', () => {
    const result = bpListQuerySchema.parse({ uid: '1', page: '1', limit: '10' });
    expect(result.uid).toBe('1');
  });

  it('rejects non-numeric uid', () => {
    expect(() => bpListQuerySchema.parse({ uid: 'abc', page: '1', limit: '10' })).toThrow();
  });
});

describe('BP detail query', () => {
  it('accepts optional uid on detail', () => {
    const result = bpDetailQuerySchema.parse({ uid: '11' });
    expect(result.uid).toBe('11');
  });
});

describe('UID param', () => {
  it('accepts numeric uid path param', () => {
    expect(uidParamSchema.parse({ uid: '1' }).uid).toBe('1');
  });
});

describe('BP row mapping', () => {
  it('maps password and commissionPct from scraped columns', () => {
    const row = mapBpRow(
      {
        'BP ID': 'Vistaar',
        UID: '1',
        Name: 'Vistaar City',
        'Mobile No': '9999999999',
        Status: 'Active',
        'Sponsor BP ID': '',
        'Add On': '01/01/2020',
        Password: 'vistaar21@3',
        'Current Percentage': '21',
      },
      new Date('2026-06-20T10:00:00Z'),
    );
    expect(row.bpCode).toBe('Vistaar');
    expect(row.uid).toBe('1');
    expect(row.password).toBe('vistaar21@3');
    expect(row.commissionPct).toBe('21');
    expect(row.sponsorCode).toBe('');
  });

  it('falls back to Current column for commissionPct', () => {
    expect(pickCommissionPct({ Current: '13' })).toBe('13');
  });

  it('maps ambiguous BP candidates', () => {
    const candidate = mapBpCandidate({
      UID: '11',
      'BP ID': 'Vistaar',
      Name: 'Vistaar',
      'Sponsor BP ID': 'SBTPL011',
      'Current Percentage': '13',
    });
    expect(candidate).toEqual({
      uid: '11',
      bpCode: 'Vistaar',
      name: 'Vistaar',
      sponsorCode: 'SBTPL011',
      commissionPct: '13',
    });
  });
});

describe('BP code validation', () => {
  it('accepts Vistaar as valid bp code', () => {
    expect(isValidBpCode('Vistaar')).toBe(true);
  });
});

describe('AppError.conflict', () => {
  it('returns 409 with candidate list', () => {
    const candidates = [{ uid: '1', bpCode: 'Vistaar', name: 'A', sponsorCode: '' }];
    const err = AppError.conflict('Ambiguous BP code: Vistaar', candidates);
    expect(err.statusCode).toBe(409);
    expect(err.errors).toEqual(candidates);
  });
});

describe('Validation errors', () => {
  it('rejects invalid bpCode format', () => {
    expect(() => bpCodeParamSchema.parse({ bpCode: 'bad code!' })).toThrow();
  });

  it('accepts valid bpCode', () => {
    const result = bpCodeParamSchema.parse({ bpCode: 'BP12345' });
    expect(result.bpCode).toBe('BP12345');
  });

  it('rejects invalid updatedAfter in bp list query', () => {
    expect(() =>
      bpListQuerySchema.parse({ updatedAfter: 'yesterday', page: '1', limit: '10' }),
    ).toThrow();
  });
});
