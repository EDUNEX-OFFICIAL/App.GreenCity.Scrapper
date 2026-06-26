import { getAllModuleRowCounts } from '@greencity/db';
import {
  INTEGRATION_RAW_MODULE_ALLOWLIST,
  INTEGRATION_TYPED_MODULES,
  PAYMENT_SOURCE_MODULES,
} from '../lib/integration-modules';
import type { ModuleCatalogItem } from '../dto/extended.dto';

const TYPED_ENDPOINT_BY_MODULE: Record<string, string> = {
  accounting_transactions: '/transactions',
  sale_transactions: '/sale-transactions',
  income_by_sale_earning: '/income-by-sale-earning',
  plot_list: '/plots',
  registered_plot_list: '/plots',
  govt_survey_plot: '/plots',
  branch: '/branches',
  master_bank: '/banks',
  accounting_entity: '/accounting-entities',
  sale_list: '/sales',
  neft_list: '/payments',
  sale_report_transactions: '/payments',
  project: '/projects',
  bp_list: '/bps',
};

function isPaymentModule(moduleKey: string): boolean {
  return Object.values(PAYMENT_SOURCE_MODULES).includes(moduleKey);
}

export const ModuleCatalogService = {
  async list(): Promise<ModuleCatalogItem[]> {
    const counts = await getAllModuleRowCounts();
    const keys = new Set([
      ...Object.keys(counts),
      ...INTEGRATION_RAW_MODULE_ALLOWLIST,
      ...Object.values(INTEGRATION_TYPED_MODULES).flatMap((v) => (Array.isArray(v) ? v : [v])),
      ...Object.values(PAYMENT_SOURCE_MODULES),
      'bp_list',
    ]);

    return [...keys]
      .sort()
      .map((moduleKey) => ({
        moduleKey,
        rowCount: counts[moduleKey] ?? 0,
        exposedOnApi:
          INTEGRATION_RAW_MODULE_ALLOWLIST.has(moduleKey) ||
          Boolean(TYPED_ENDPOINT_BY_MODULE[moduleKey]) ||
          isPaymentModule(moduleKey),
        typedEndpoint: TYPED_ENDPOINT_BY_MODULE[moduleKey],
      }));
  },
};
