import type { PaymentItem, PaymentType } from '../dto/payments.dto';
import { PAYMENT_SOURCE_MODULES } from '../lib/integration-modules';
import {
  mapGenericPayoutRow,
  mapNeftPayment,
  mapReceiptPayment,
  parseRowDate,
  paymentSortDate,
} from '../mappers/field-mappers';
import { RawModuleRepository } from '../repositories/raw-module.repository';

function filterByDateRange(items: PaymentItem[], from?: Date, to?: Date): PaymentItem[] {
  if (!from && !to) return items;
  return items.filter((item) => {
    const d = parseRowDate(item.date) ?? new Date(item.updatedAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

const LEGACY_MAPPERS: Partial<Record<PaymentType, (row: Record<string, string>, d: Date) => PaymentItem>> = {
  neft: mapNeftPayment,
  receipt: mapReceiptPayment,
};

export const PaymentsService = {
  async list(params: {
    page: number;
    limit: number;
    updatedAfter?: Date;
    from?: Date;
    to?: Date;
    type?: PaymentType;
  }): Promise<{ items: PaymentItem[]; total: number }> {
    const typesToFetch = params.type
      ? [params.type]
      : (Object.keys(PAYMENT_SOURCE_MODULES) as PaymentType[]);

    const batches = await Promise.all(
      typesToFetch.map(async (type) => {
        const moduleKey = PAYMENT_SOURCE_MODULES[type];
        if (!moduleKey) return [] as PaymentItem[];
        const rows = await RawModuleRepository.fetchAllModuleRows({
          moduleKey,
          updatedAfter: params.updatedAfter,
        });
        const legacy = LEGACY_MAPPERS[type];
        return rows.map((r) =>
          legacy
            ? legacy(r.rowJson, r.lastSeenAt)
            : mapGenericPayoutRow(type, moduleKey, r.rowJson, r.lastSeenAt),
        );
      }),
    );

    let items = batches.flat().filter((p) => p.id);
    items = filterByDateRange(items, params.from, params.to);
    items.sort((a, b) => paymentSortDate(b) - paymentSortDate(a));

    const total = items.length;
    const offset = (params.page - 1) * params.limit;
    return { items: items.slice(offset, offset + params.limit), total };
  },
};
