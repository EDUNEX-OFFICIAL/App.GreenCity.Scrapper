import {
  countDistinctSaleTransactions,
  queryDistinctSaleTransactions,
} from '@greencity/db';
import { INTEGRATION_TYPED_MODULES } from '../lib/integration-modules';
import {
  mapAccountingEntityRow,
  mapBankRow,
  mapBranchRow,
  mapIncomeBySaleEarningRow,
  mapPlotRow,
  mapSaleTransactionRow,
  mapTransactionRow,
  parseRowDate,
  pick,
} from '../mappers/field-mappers';
import { RawModuleRepository } from '../repositories/raw-module.repository';
import { listTypedModuleRows, listTypedMultiModuleRows } from './typed-module-list.service';

export type TypedListQuery = {
  page: number;
  limit: number;
  updatedAfter?: Date;
  from?: Date;
  to?: Date;
};

const hasId = (id: string) => Boolean(id?.trim());

export const TransactionsService = {
  list: (params: TypedListQuery) =>
    listTypedModuleRows({
      ...params,
      moduleKey: INTEGRATION_TYPED_MODULES.transactions,
      map: mapTransactionRow,
      filter: (t) => hasId(t.id),
      dateField: (t) => t.date,
    }),
};

export const SaleTransactionsService = {
  async list(params: TypedListQuery): Promise<{ items: import('../dto/extended.dto').SaleTransactionItem[]; total: number }> {
    const hasDateFilter = Boolean(params.from || params.to);

    if (hasDateFilter) {
      const allRows = await RawModuleRepository.fetchAllModuleRows({
        moduleKey: INTEGRATION_TYPED_MODULES.saleTransactions,
        updatedAfter: params.updatedAfter,
      });
      const byDeposit = new Map<string, import('../dto/extended.dto').SaleTransactionItem>();
      for (const r of allRows) {
        const item = mapSaleTransactionRow(r.rowJson, r.lastSeenAt);
        if (!item.id) continue;
        const key = item.depositId || item.id;
        const existing = byDeposit.get(key);
        if (!existing || item.updatedAt > existing.updatedAt) byDeposit.set(key, item);
      }
      let items = [...byDeposit.values()];
      items = items.filter((item) => {
        const raw = item.date;
        const d = parseRowDate(raw) ?? new Date(item.updatedAt);
        if (params.from && d < params.from) return false;
        if (params.to && d > params.to) return false;
        return true;
      });
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const total = items.length;
      const offset = (params.page - 1) * params.limit;
      return { items: items.slice(offset, offset + params.limit), total };
    }

    const [rows, total] = await Promise.all([
      queryDistinctSaleTransactions({
        page: params.page,
        limit: params.limit,
        updatedAfter: params.updatedAfter,
      }),
      countDistinctSaleTransactions({ updatedAfter: params.updatedAfter }),
    ]);
    const items = rows
      .map((r: { rowJson: Record<string, string>; lastSeenAt: Date }) =>
        mapSaleTransactionRow(r.rowJson, r.lastSeenAt),
      )
      .filter((t: import('../dto/extended.dto').SaleTransactionItem) => hasId(t.id));
    return { items, total };
  },
};

export const IncomeBySaleEarningService = {
  list: (params: TypedListQuery) =>
    listTypedModuleRows({
      ...params,
      moduleKey: INTEGRATION_TYPED_MODULES.incomeBySaleEarning,
      map: mapIncomeBySaleEarningRow,
      filter: (t) => hasId(t.id),
      dateField: (t) => t.receiptDate ?? t.transactionDate,
    }),
};

export const PlotsService = {
  list: (params: Pick<TypedListQuery, 'page' | 'limit' | 'updatedAfter'>) =>
    listTypedMultiModuleRows(INTEGRATION_TYPED_MODULES.plots, {
      ...params,
      map: (moduleKey, row, lastSeenAt) =>
        mapPlotRow(
          moduleKey,
          row,
          lastSeenAt,
          pick(row, 'Plot', 'Plot No', 'Plot No.', 'SrNo', 'ID') || `${moduleKey}-${lastSeenAt.getTime()}`,
        ),
      filter: (p) => hasId(p.id) || Boolean(p.plotNo),
    }),
};

export const BranchesService = {
  list: (params: TypedListQuery) =>
    listTypedModuleRows({
      ...params,
      moduleKey: INTEGRATION_TYPED_MODULES.branches,
      map: (row, lastSeenAt) =>
        mapBranchRow(row, lastSeenAt, pick(row, 'Name', 'Code', 'SrNo') || lastSeenAt.toISOString()),
      filter: (b) => hasId(b.name),
    }),
};

export const BanksService = {
  list: (params: TypedListQuery) =>
    listTypedModuleRows({
      ...params,
      moduleKey: INTEGRATION_TYPED_MODULES.banks,
      map: (row, lastSeenAt) =>
        mapBankRow(
          row,
          lastSeenAt,
          pick(row, 'Bank Name', 'Account No', 'SrNo') || lastSeenAt.toISOString(),
        ),
      filter: (b) => hasId(b.bankName),
    }),
};

export const AccountingEntitiesService = {
  list: (params: TypedListQuery) =>
    listTypedModuleRows({
      ...params,
      moduleKey: INTEGRATION_TYPED_MODULES.accountingEntities,
      map: (row, lastSeenAt) =>
        mapAccountingEntityRow(row, lastSeenAt, pick(row, 'Name', 'SrNo', 'ID') || lastSeenAt.toISOString()),
      filter: (e) => hasId(e.name),
    }),
};
