import { AppError } from '../lib/errors';
import { INTEGRATION_RAW_MODULE_ALLOWLIST } from '../lib/integration-modules';
import type { RawModuleRowItem } from '../dto/extended.dto';
import { RawModuleRepository } from '../repositories/raw-module.repository';

export const ModuleRawService = {
  async list(params: {
    moduleKey: string;
    page: number;
    limit: number;
    updatedAfter?: Date;
  }): Promise<{ items: RawModuleRowItem[]; total: number }> {
    if (!INTEGRATION_RAW_MODULE_ALLOWLIST.has(params.moduleKey)) {
      throw AppError.notFound(`Module not exposed on integration API: ${params.moduleKey}`);
    }

    const [rows, total] = await Promise.all([
      RawModuleRepository.listModuleRows(params),
      RawModuleRepository.countModuleRows({
        moduleKey: params.moduleKey,
        updatedAfter: params.updatedAfter,
      }),
    ]);

    const items = rows.map((r) => ({
      moduleKey: params.moduleKey,
      id: r.id,
      data: r.rowJson,
      updatedAt: r.lastSeenAt.toISOString(),
    }));

    return { items, total };
  },
};
