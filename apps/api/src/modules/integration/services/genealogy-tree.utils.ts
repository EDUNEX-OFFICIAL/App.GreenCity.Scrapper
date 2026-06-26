import type { GenealogyTreeNode } from '../dto/genealogy.dto';

interface EdgeRow {
  parentBpCode: string;
  childBpCode: string;
  leg: string;
}

export function buildTreeFromEdges(
  rootBpCode: string,
  edges: EdgeRow[],
  nameMap: Map<string, string>,
): GenealogyTreeNode[] {
  const childrenByParent = new Map<string, EdgeRow[]>();
  for (const edge of edges) {
    const parentKey = edge.parentBpCode.toLowerCase();
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey)!.push(edge);
  }

  const visited = new Set<string>();

  function buildNode(bpCode: string, leg?: GenealogyTreeNode['leg']): GenealogyTreeNode {
    const key = bpCode.toLowerCase();
    visited.add(key);
    const childEdges = childrenByParent.get(key) ?? [];
    const children: GenealogyTreeNode[] = [];
    for (const edge of childEdges) {
      const childKey = edge.childBpCode.toLowerCase();
      if (visited.has(childKey)) continue;
      const childLeg =
        edge.leg === 'left' || edge.leg === 'right' || edge.leg === 'sponsor'
          ? edge.leg
          : undefined;
      children.push(buildNode(edge.childBpCode, childLeg));
    }
    return {
      bpCode,
      bpName: nameMap.get(key),
      leg,
      children,
    };
  }

  const rootKey = rootBpCode.toLowerCase();
  const directChildren = childrenByParent.get(rootKey) ?? [];
  return directChildren.map((edge) => {
    const childLeg =
      edge.leg === 'left' || edge.leg === 'right' || edge.leg === 'sponsor'
        ? edge.leg
        : undefined;
    return buildNode(edge.childBpCode, childLeg);
  });
}
