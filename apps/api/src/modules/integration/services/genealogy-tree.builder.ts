import { GenealogyRepository } from '../repositories/raw-module.repository';
import { resolveGenealogyLookupCode } from '@greencity/db';
import { buildTreeFromEdges } from './genealogy-tree.utils';

export async function buildGenealogyResponse(requestedBpCode: string | undefined, uid?: string) {
  let lookupCode: string;
  let resolvedUid = uid;
  let resolvedBpCode = requestedBpCode ?? '';

  if (uid) {
    const nodes = await GenealogyRepository.getNodesForUid(uid);
    const rootNode = nodes[0];
    if (rootNode) {
      lookupCode = await resolveGenealogyLookupCode(rootNode.bpCode, uid);
      resolvedBpCode = rootNode.bpCode;
    } else if (requestedBpCode) {
      lookupCode = await resolveGenealogyLookupCode(requestedBpCode, uid);
      resolvedBpCode = requestedBpCode;
    } else {
      lookupCode = uid;
      resolvedBpCode = uid;
    }
  } else if (requestedBpCode) {
    lookupCode = await resolveGenealogyLookupCode(requestedBpCode);
    resolvedBpCode = requestedBpCode;
  } else {
    throw new Error('buildGenealogyResponse requires bpCode or uid');
  }

  const [nodes, sponsorEdges, binaryEdges] = await Promise.all([
    uid
      ? GenealogyRepository.getNodesForUid(uid)
      : GenealogyRepository.getNodesForBp(lookupCode),
    GenealogyRepository.getEdgesForBp(lookupCode, 'sponsor'),
    GenealogyRepository.getEdgesForBp(lookupCode, 'binary'),
  ]);

  if (!resolvedUid && nodes[0]?.uid) {
    resolvedUid = nodes[0].uid;
  }

  const allBpCodes = new Set<string>([lookupCode]);
  for (const edge of [...sponsorEdges, ...binaryEdges]) {
    allBpCodes.add(edge.parentBpCode);
    allBpCodes.add(edge.childBpCode);
  }
  const nameMap = await GenealogyRepository.getNodeNames([...allBpCodes]);

  const sponsorTree = buildTreeFromEdges(lookupCode, sponsorEdges, nameMap);
  const binaryTree = buildTreeFromEdges(lookupCode, binaryEdges, nameMap);

  return {
    bpCode: resolvedBpCode,
    uid: resolvedUid,
    sponsorTree,
    binaryTree,
    nodes,
  };
}

export { buildTreeFromEdges } from './genealogy-tree.utils';
