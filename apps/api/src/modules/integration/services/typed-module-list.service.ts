import type { RawRow } from '../mappers/field-mappers';
import { parseRowDate } from '../mappers/field-mappers';
import { RawModuleRepository } from '../repositories/raw-module.repository';

export async function listTypedModuleRows<T extends { updatedAt: string }>(params: {
  moduleKey: string;
  page: number;
  limit: number;
  updatedAfter?: Date;
  from?: Date;
  to?: Date;
  dateField?: (item: T) => string | undefined;
  map: (row: RawRow, lastSeenAt: Date) => T;
  filter?: (item: T) => boolean;
}): Promise<{ items: T[]; total: number }> {
  const { map, filter, dateField, from, to } = params;
  const hasDateFilter = Boolean(from || to);

  if (hasDateFilter) {
    const allRows = await RawModuleRepository.fetchAllModuleRows({
      moduleKey: params.moduleKey,
      updatedAfter: params.updatedAfter,
    });
    let items = allRows.map((r) => map(r.rowJson, r.lastSeenAt));
    if (filter) items = items.filter(filter);
    if (dateField) {
      items = items.filter((item) => {
        const raw = dateField(item);
        const d = parseRowDate(raw) ?? new Date(item.updatedAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    const total = items.length;
    const offset = (params.page - 1) * params.limit;
    return { items: items.slice(offset, offset + params.limit), total };
  }

  const [rows, total] = await Promise.all([
    RawModuleRepository.listModuleRows({
      moduleKey: params.moduleKey,
      page: params.page,
      limit: params.limit,
      updatedAfter: params.updatedAfter,
    }),
    RawModuleRepository.countModuleRows({
      moduleKey: params.moduleKey,
      updatedAfter: params.updatedAfter,
    }),
  ]);

  let items = rows.map((r) => map(r.rowJson, r.lastSeenAt));
  if (filter) items = items.filter(filter);
  return { items, total };
}

export async function listTypedMultiModuleRows<T extends { updatedAt: string }>(
  moduleKeys: readonly string[],
  params: {
    page: number;
    limit: number;
    updatedAfter?: Date;
    map: (moduleKey: string, row: RawRow, lastSeenAt: Date) => T;
    filter?: (item: T) => boolean;
  },
): Promise<{ items: T[]; total: number }> {
  const batches = await Promise.all(
    moduleKeys.map((moduleKey) =>
      RawModuleRepository.fetchAllModuleRows({
        moduleKey,
        updatedAfter: params.updatedAfter,
      }).then((rows) => rows.map((r) => params.map(moduleKey, r.rowJson, r.lastSeenAt))),
    ),
  );
  let items = batches.flat();
  if (params.filter) items = items.filter(params.filter);
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const total = items.length;
  const offset = (params.page - 1) * params.limit;
  return { items: items.slice(offset, offset + params.limit), total };
}
