import type { BpDetail, BpListItem } from '../dto/bp.dto';
import { resolveGenealogyLookupCode } from '@greencity/db';
import { AppError } from '../lib/errors';
import { mapBpDetail, mapBpRow, mapBpCandidate, isValidBpCode } from '../mappers/field-mappers';
import { RawModuleRepository } from '../repositories/raw-module.repository';
import { GenealogyRepository } from '../repositories/raw-module.repository';

async function enrichWithGenealogy(
  bpCode: string,
  row: { rowJson: Record<string, string>; lastSeenAt: Date },
  uid?: string,
): Promise<BpDetail> {
  const lookupCode = await resolveGenealogyLookupCode(bpCode, uid);
  const nodes = uid
    ? await GenealogyRepository.getNodesForUid(uid)
    : await GenealogyRepository.getNodesForBp(lookupCode);
  const sponsorNode = nodes.find((n) => n.treeType === 'sponsor');
  const modalData = sponsorNode?.modalData as Record<string, string | undefined> | undefined;
  return mapBpDetail(row.rowJson, row.lastSeenAt, modalData);
}

export const BpService = {
  async list(params: {
    page: number;
    limit: number;
    updatedAfter?: Date;
    search?: string;
    uid?: string;
  }): Promise<{ items: BpListItem[]; total: number }> {
    const [rows, total] = await Promise.all([
      RawModuleRepository.listDistinctBps(params),
      RawModuleRepository.countDistinctBps({
        updatedAfter: params.updatedAfter,
        search: params.search,
        uid: params.uid,
      }),
    ]);
    const items = rows
      .map((r) => mapBpRow(r.rowJson, r.lastSeenAt))
      .filter((b) => b.bpCode && isValidBpCode(b.bpCode));
    return { items, total };
  },

  async getByCode(bpCode: string, uid?: string): Promise<BpDetail> {
    if (uid) {
      const row = await RawModuleRepository.getBpByCodeAndUid(bpCode, uid);
      if (!row) throw AppError.notFound(`BP not found: ${bpCode} (uid=${uid})`);
      return enrichWithGenealogy(bpCode, row, uid);
    }

    const rows = await RawModuleRepository.getBpRowsByCode(bpCode);
    const validRows = rows.filter((r) => {
      const code = r.rowJson['BP ID']?.trim();
      return code && isValidBpCode(code);
    });

    if (validRows.length === 0) throw AppError.notFound(`BP not found: ${bpCode}`);
    if (validRows.length > 1) {
      const candidates = validRows.map((r) => mapBpCandidate(r.rowJson));
      throw AppError.conflict(
        `Ambiguous BP code: ${bpCode}. Multiple members share this code — pass ?uid= or use GET /bps/by-uid/{uid}.`,
        candidates,
      );
    }

    return enrichWithGenealogy(bpCode, validRows[0]!);
  },

  async getByUid(uid: string): Promise<BpDetail> {
    const row = await RawModuleRepository.getBpByUid(uid);
    if (!row) throw AppError.notFound(`BP not found for uid: ${uid}`);

    const bpCode = row.rowJson['BP ID']?.trim();
    if (!bpCode || !isValidBpCode(bpCode)) {
      throw AppError.notFound(`BP not found for uid: ${uid}`);
    }

    return enrichWithGenealogy(bpCode, row, uid);
  },
};
