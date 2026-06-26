import { describe, expect, it } from 'vitest';
import { buildTreeFromEdges } from '../../modules/integration/services/genealogy-tree.utils';

describe('Genealogy tree builder', () => {
  it('builds hierarchical sponsor tree with legs', () => {
    const nameMap = new Map<string, string>([
      ['root', 'Root BP'],
      ['child1', 'Child One'],
      ['child2', 'Child Two'],
    ]);
    const edges = [
      { parentBpCode: 'root', childBpCode: 'child1', leg: 'sponsor' },
      { parentBpCode: 'root', childBpCode: 'child2', leg: 'sponsor' },
      { parentBpCode: 'child1', childBpCode: 'child2', leg: 'sponsor' },
    ];
    const tree = buildTreeFromEdges('root', edges, nameMap);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.bpCode).toBe('child1');
    expect(tree[0]?.leg).toBe('sponsor');
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.bpCode).toBe('child2');
  });

  it('builds binary tree with left/right legs', () => {
    const nameMap = new Map<string, string>([
      ['root', 'Root'],
      ['left', 'Left BP'],
      ['right', 'Right BP'],
    ]);
    const edges = [
      { parentBpCode: 'root', childBpCode: 'left', leg: 'left' },
      { parentBpCode: 'root', childBpCode: 'right', leg: 'right' },
    ];
    const tree = buildTreeFromEdges('root', edges, nameMap);
    expect(tree).toHaveLength(2);
    const legs = tree.map((n) => n.leg).sort();
    expect(legs).toEqual(['left', 'right']);
  });
});
