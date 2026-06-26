import type { GenealogyResponse } from '../dto/genealogy.dto';
import { getBpRowsByCode } from '@greencity/db';
import { AppError } from '../lib/errors';
import { mapBpCandidate, isValidBpCode } from '../mappers/field-mappers';
import { buildGenealogyResponse } from './genealogy-tree.builder';

export const GenealogyService = {
  async getForBp(bpCode: string, uid?: string): Promise<GenealogyResponse> {
    if (!uid) {
      const rows = await getBpRowsByCode(bpCode);
      const validRows = rows.filter((r) => {
        const code = r.rowJson['BP ID']?.trim();
        return code && isValidBpCode(code);
      });
      if (validRows.length > 1) {
        const candidates = validRows.map((r) => mapBpCandidate(r.rowJson));
        throw AppError.conflict(
          `Ambiguous BP code for genealogy: ${bpCode}. Pass ?uid= or use GET /genealogy/by-uid/{uid}.`,
          candidates,
        );
      }
    }

    const result = await buildGenealogyResponse(bpCode, uid);
    const hasTrees = result.sponsorTree.length > 0 || result.binaryTree.length > 0;
    if (result.nodes.length === 0 && !hasTrees) {
      throw AppError.notFound(`Genealogy not found for BP: ${bpCode}${uid ? ` (uid=${uid})` : ''}`);
    }
    return {
      bpCode: result.bpCode,
      uid: result.uid,
      sponsorTree: result.sponsorTree,
      binaryTree: result.binaryTree,
    };
  },

  async getForUid(uid: string): Promise<GenealogyResponse> {
    const result = await buildGenealogyResponse(undefined, uid);
    const hasTrees = result.sponsorTree.length > 0 || result.binaryTree.length > 0;
    if (result.nodes.length === 0 && !hasTrees) {
      throw AppError.notFound(`Genealogy not found for uid: ${uid}`);
    }
    return {
      bpCode: result.bpCode,
      uid: result.uid,
      sponsorTree: result.sponsorTree,
      binaryTree: result.binaryTree,
    };
  },
};
