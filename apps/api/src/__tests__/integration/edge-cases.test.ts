import { describe, expect, it } from 'vitest';
import { buildTreeFromEdges } from '../../modules/integration/services/genealogy-tree.utils';
import { isValidBpCode, parseRowDate } from '../../modules/integration/mappers/field-mappers';

describe('Genealogy deep subtree', () => {
  it('builds multi-level tree from full edge set', () => {
    const nameMap = new Map<string, string>([
      ['root', 'Root'],
      ['c1', 'Child 1'],
      ['gc1', 'Grandchild 1'],
    ]);
    const edges = [
      { parentBpCode: 'root', childBpCode: 'c1', leg: 'sponsor' },
      { parentBpCode: 'c1', childBpCode: 'gc1', leg: 'sponsor' },
    ];
    const tree = buildTreeFromEdges('root', edges, nameMap);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.bpCode).toBe('c1');
    expect(tree[0]?.children[0]?.bpCode).toBe('gc1');
  });
});

describe('BP code validation', () => {
  it('rejects scraper noise rows', () => {
    expect(isValidBpCode('>>')).toBe(false);
    expect(isValidBpCode('123')).toBe(false);
    expect(isValidBpCode('&nbsp;')).toBe(false);
    expect(isValidBpCode('BP12345')).toBe(true);
  });
});

describe('Date parsing', () => {
  it('parses ISO dates', () => {
    const d = parseRowDate('2026-06-20T10:00:00Z');
    expect(d?.toISOString()).toBe('2026-06-20T10:00:00.000Z');
  });

  it('parses DD/MM/YYYY dates from ERP', () => {
    const d = parseRowDate('15/01/2024');
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(0);
    expect(d?.getDate()).toBe(15);
  });
});
