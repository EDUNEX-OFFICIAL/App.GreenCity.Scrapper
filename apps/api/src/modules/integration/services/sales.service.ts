import type { SaleItem } from '../dto/sales.dto';
import { mapSaleRow, parseRowDate } from '../mappers/field-mappers';
import { RawModuleRepository } from '../repositories/raw-module.repository';

function filterByDateRange(items: SaleItem[], from?: Date, to?: Date): SaleItem[] {
  if (!from && !to) return items;
  return items.filter((item) => {
    const d = parseRowDate(item.saleDate) ?? new Date(item.updatedAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export const SalesService = {
  async list(params: {
    page: number;
    limit: number;
    updatedAfter?: Date;
    from?: Date;
    to?: Date;
  }): Promise<{ items: SaleItem[]; total: number }> {
    const hasDateFilter = Boolean(params.from || params.to);

    if (hasDateFilter) {
      const allRows = await RawModuleRepository.fetchAllSales({
        updatedAfter: params.updatedAfter,
      });
      let items = allRows
        .map((r) => mapSaleRow(r.rowJson, r.lastSeenAt))
        .filter((s) => s.saleId || s.bookingNo);
      items = filterByDateRange(items, params.from, params.to);
      const total = items.length;
      const offset = (params.page - 1) * params.limit;
      return { items: items.slice(offset, offset + params.limit), total };
    }

    const [rows, total] = await Promise.all([
      RawModuleRepository.listSales(params),
      RawModuleRepository.countSales({ updatedAfter: params.updatedAfter }),
    ]);

    const items = rows
      .map((r) => mapSaleRow(r.rowJson, r.lastSeenAt))
      .filter((s) => s.saleId || s.bookingNo);

    return { items, total };
  },
};
