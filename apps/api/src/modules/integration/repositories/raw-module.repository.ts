import {
  countDistinctModuleRows,
  countDistinctSaleTransactions,
  countModuleRows,
  fetchAllModuleRows,
  getAllGenealogyEdgesForTree,
  getBpByCodeAndUid,
  getBpByUid,
  getBpRowsByCode,
  getGenealogyEdgesForBp,
  getGenealogyNodeNames,
  getGenealogyNodesForBp,
  getGenealogyNodesForUid,
  getLatestRowByKey,
  queryDistinctModuleRows,
  queryDistinctSaleTransactions,
  queryModuleRows,
} from '@greencity/db';

const BP_DISTINCT_KEYS = ['UID', 'BP ID'] as const;

export const RawModuleRepository = {
  listDistinctBps: (params: {
    page: number;
    limit: number;
    updatedAfter?: Date;
    search?: string;
    uid?: string;
  }) =>
    queryDistinctModuleRows({
      moduleKey: 'bp_list',
      distinctKey: 'BP ID',
      distinctKeys: [...BP_DISTINCT_KEYS],
      searchKeys: ['BP ID', 'Name', 'Mobile No'],
      ...params,
    }),

  countDistinctBps: (params: { updatedAfter?: Date; search?: string; uid?: string }) =>
    countDistinctModuleRows({
      moduleKey: 'bp_list',
      distinctKey: 'BP ID',
      distinctKeys: [...BP_DISTINCT_KEYS],
      searchKeys: ['BP ID', 'Name', 'Mobile No'],
      ...params,
    }),

  getBpByCode: (bpCode: string) =>
    getLatestRowByKey({ moduleKey: 'bp_list', keyField: 'BP ID', keyValue: bpCode }),

  getBpRowsByCode: (bpCode: string) => getBpRowsByCode(bpCode),

  getBpByUid: (uid: string) => getBpByUid(uid),

  getBpByCodeAndUid: (bpCode: string, uid: string) => getBpByCodeAndUid(bpCode, uid),

  listSales: (params: { page: number; limit: number; updatedAfter?: Date }) =>
    queryModuleRows({ moduleKey: 'sale_list', ...params }),

  countSales: (params: { updatedAfter?: Date }) =>
    countModuleRows({ moduleKey: 'sale_list', ...params }),

  listNeftPayments: (params: { page: number; limit: number; updatedAfter?: Date }) =>
    queryModuleRows({ moduleKey: 'neft_list', ...params }),

  countNeftPayments: (params: { updatedAfter?: Date }) =>
    countModuleRows({ moduleKey: 'neft_list', ...params }),

  listReceiptPayments: (params: { page: number; limit: number; updatedAfter?: Date }) =>
    queryModuleRows({ moduleKey: 'sale_report_transactions', ...params }),

  countReceiptPayments: (params: { updatedAfter?: Date }) =>
    countModuleRows({ moduleKey: 'sale_report_transactions', ...params }),

  listProjects: (params: { page: number; limit: number; updatedAfter?: Date }) =>
    queryModuleRows({ moduleKey: 'project', ...params }),

  countProjects: (params: { updatedAfter?: Date }) =>
    countModuleRows({ moduleKey: 'project', ...params }),

  fetchAllSales: (params: { updatedAfter?: Date }) =>
    fetchAllModuleRows({ moduleKey: 'sale_list', ...params }),

  fetchAllNeftPayments: (params: { updatedAfter?: Date }) =>
    fetchAllModuleRows({ moduleKey: 'neft_list', ...params }),

  fetchAllReceiptPayments: (params: { updatedAfter?: Date }) =>
    fetchAllModuleRows({ moduleKey: 'sale_report_transactions', ...params }),

  listModuleRows: (params: {
    moduleKey: string;
    page: number;
    limit: number;
    updatedAfter?: Date;
  }) => queryModuleRows({ ...params }),

  countModuleRows: (params: { moduleKey: string; updatedAfter?: Date }) =>
    countModuleRows({ ...params }),

  fetchAllModuleRows: (params: { moduleKey: string; updatedAfter?: Date; maxRows?: number }) =>
    fetchAllModuleRows({ ...params }),

  listDistinctSaleTransactions: (params: {
    page: number;
    limit: number;
    updatedAfter?: Date;
  }) => queryDistinctSaleTransactions(params),

  countDistinctSaleTransactions: (params: { updatedAfter?: Date }) =>
    countDistinctSaleTransactions(params),
};

export const GenealogyRepository = {
  getNodesForBp: getGenealogyNodesForBp,
  getNodesForUid: getGenealogyNodesForUid,
  getEdgesForBp: getGenealogyEdgesForBp,
  getAllEdgesForTree: getAllGenealogyEdgesForTree,
  getNodeNames: getGenealogyNodeNames,
};
