import type { ModuleConfig } from './types.js';
import { ADMIN_DIRECT_URLS } from './admin-urls.js';
import { getModuleSelectorOverrides } from '../selectors/profiles.js';
import { enrichModuleFromGenerated } from '../selectors/loader.js';

function mod(
  key: string,
  label: string,
  navPath: string[],
  opts: Partial<ModuleConfig> = {},
): ModuleConfig {
  const selectorOverrides = getModuleSelectorOverrides(key);
  const tableType = opts.tableType ?? 'paginated-grid';
  return {
    key,
    portal: 'admin',
    label,
    navPath,
    tableType,
    schedule: opts.schedule ?? 'daily',
    primaryKey: opts.primaryKey ?? ['id'],
    backfill: opts.backfill ?? { type: 'none', startStrategy: 'erp_min' },
    wave: opts.wave ?? 2,
    upsertPerPage: opts.upsertPerPage ?? tableType === 'paginated-grid',
    ...opts,
    selectors: opts.selectors ?? selectorOverrides,
    directUrl: opts.directUrl ?? ADMIN_DIRECT_URLS[key],
  };
}

/** Wave 1 pilot modules — validated end-to-end first */
export const WAVE1_MODULES: ModuleConfig[] = [
  mod('master_bank', 'Bank', ['Master', 'Bank'], {
    tableType: 'grid',
    schedule: 'weekly',
    primaryKey: ['Bank Name', 'Account No'],
    wave: 1,
  }),
  mod('bp_list', 'BP List', ['BP Management', 'BP List'], {
    tableType: 'paginated-grid',
    schedule: 'daily',
    primaryKey: ['UID', 'BP ID'],
    pagingMode: 'inline-grid',
    maxPages: 1769,
    upsertPerPage: true,
    wave: 1,
  }),
  mod('sale_list', 'Sale List', ['Sale Operation', 'Sale List'], {
    tableType: 'paginated-grid',
    schedule: 'daily',
    primaryKey: ['Sale ID', 'Booking No'],
    wave: 1,
  }),
  mod('accounting_transactions', 'Accounting Transactions', [
    'Accounts Operation',
    'Accounting Transactions',
  ], {
    tableType: 'paginated-grid',
    schedule: 'daily',
    primaryKey: ['Trans ID', 'Voucher No'],
    wave: 1,
  }),
  mod('neft_list', 'NEFT List', ['BP Payout', 'NEFT List'], {
    tableType: 'paginated-grid',
    schedule: 'daily',
    primaryKey: ['NEFT ID', 'Reference No'],
    wave: 1,
    dropdownIterate: {
      selector: '#ContentPlaceHolder1_DropDownList1',
      valueKey: 'Payout ID',
      labelKey: 'Payout Label',
      searchAfterSelect: true,
    },
  }),
];

/** Full admin module registry */
export const ADMIN_MODULES: ModuleConfig[] = [
  ...WAVE1_MODULES,
  // Accounts Operation
  mod('bp_payment', 'BP Payment', ['Accounts Operation', 'BP Payment']),
  mod('business_promotion', 'Business Promotion', ['Accounts Operation', 'Business Promotion']),
  mod('director_payment', 'Director Payment', ['Accounts Operation', 'Director Payment']),
  mod('fee_and_charges', 'Fee and Charges', ['Accounts Operation', 'Fee and Charges']),
  mod('investor', 'Investor', ['Accounts Operation', 'Investor']),
  mod('land_expense', 'Land Expense', ['Accounts Operation', 'Land Expense']),
  mod('loan_advances', 'Loan & Advances', ['Accounts Operation', 'Loan & Advances']),
  mod('monthly_expense', 'Monthly Expense', ['Accounts Operation', 'Monthly Expense']),
  mod('office_expense', 'Office Expense', ['Accounts Operation', 'Office Expense']),
  mod('selling_distribution', 'Selling and Distribution', ['Accounts Operation', 'Selling and Distribution']),
  mod('site_visit', 'Site Visit', ['Accounts Operation', 'Site Visit']),
  mod('tax_consultancy', 'Tax and Consultancy', ['Accounts Operation', 'Tax and Consultancy']),
  mod('accounts_daily_summary', 'Daily Summary', ['Accounts Operation', 'Daily Summary'], {
    tableType: 'report-filter',
    backfill: { type: 'daily', startStrategy: 'erp_min' },
  }),
  // Sale Operation
  mod('new_sale', 'New Sale', ['Sale Operation', 'New Sale']),
  mod('add_earning_on_sale', 'Add Earning on Sale', ['Sale Operation', 'Add Earning on Sale']),
  mod('sale_transactions', 'Sale Transactions', ['Sale Operation', 'Sale Transactions']),
  mod('hold_for_sale', 'Hold for Sale', ['Sale Operation', 'Hold for Sale']),
  mod('sale_daily_summary', 'Daily Summary', ['Sale Operation', 'Daily Summary'], {
    tableType: 'report-filter',
    backfill: { type: 'daily', startStrategy: 'erp_min' },
  }),
  mod('sale_attachments', 'Sale Attachments', ['Sale Operation', 'Sale Attachments']),
  // Accounts Reports
  mod('accounts_daily_report', 'Daily Report', ['Accounts Reports', 'Daily Report'], {
    tableType: 'report-filter',
    backfill: { type: 'daily', startStrategy: 'erp_min' },
  }),
  mod('transactions_sheet', 'Transactions Sheet', ['Accounts Reports', 'Transactions Sheet'], {
    tableType: 'report-filter',
    backfill: { type: 'daily', startStrategy: 'erp_min' },
  }),
  mod('accounts_monthly_report', 'Monthly Report', ['Accounts Reports', 'Monthly Report'], {
    tableType: 'report-filter',
    backfill: { type: 'monthly', startStrategy: 'erp_min' },
  }),
  mod('accounts_yearly_report', 'Yearly Report', ['Accounts Reports', 'Yearly Report'], {
    tableType: 'report-filter',
    backfill: { type: 'yearly', startStrategy: 'erp_min' },
  }),
  // Administrator
  mod('users', 'Users', ['Administrator', 'Users'], { schedule: 'weekly' }),
  mod('control_group', 'Control Group', ['Administrator', 'Control Group'], { schedule: 'weekly' }),
  mod('control_page', 'Control Page', ['Administrator', 'Control Page'], { schedule: 'weekly' }),
  mod('company', 'Company', ['Administrator', 'Company'], { schedule: 'weekly' }),
  mod('accounting_trans_log', 'Accounting Trans. Log', ['Administrator', 'Accounting Trans. Log']),
  mod('full_monthly_summary', 'Full Monthly Summary', ['Administrator', 'Full Monthly Summary'], {
    tableType: 'report-filter',
    backfill: { type: 'monthly', startStrategy: 'erp_min' },
  }),
  // Banking
  mod('bank_to_bank', 'Bank To Bank', ['Banking', 'Bank To Bank']),
  mod('cash_ledger', 'Cash Ledger', ['Banking', 'Cash Ledger'], {
    tableType: 'grid',
    extractMode: 'grid',
    dropdownIterate: {
      selector: '#ContentPlaceHolder1_DropDownList1',
      valueKey: 'Branch',
      labelKey: 'Branch Label',
      searchAfterSelect: true,
    },
  }),
  mod('sale_cheques', 'Sale Cheques', ['Banking', 'Sale Cheques']),
  mod('accounting_cheques', 'Accounting Cheques', ['Banking', 'Accounting Cheques']),
  // BP Management
  mod('monthly_sale_point', 'Monthly Sale Point', ['BP Management', 'Monthly Sale Point']),
  mod('bp_income_summary', 'Income Summary', ['BP Management', 'Income Summary']),
  mod('bp_payout_mgmt', 'BP Payout', ['BP Management', 'BP Payout']),
  mod('bp_award_achieved', 'BP Award Achieved', ['BP Management', 'BP Award Achieved']),
  mod('new_bp', 'New BP', ['BP Management', 'New BP']),
  mod('bp_bulk_payment', 'BP Bulk Payment', ['BP Management', 'BP Bulk Payment']),
  mod('bp_income_summary_detail', 'BP Income Summary', ['BP Management', 'BP Income Summary'], {
    dropdownIterate: {
      selector: '#ContentPlaceHolder1_PayoutDropDownList',
      valueKey: 'Payout ID',
      labelKey: 'Payout Label',
      searchAfterSelect: true,
    },
  }),
  mod('bp_income_reward_emi', 'BP Income Reward EMI', ['BP Management', 'BP Income Reward EMI']),
  mod('income_by_sale_earning', 'Income by Sale Earning', ['BP Management', 'Income by Sale Earning'], {
    dropdownIterate: {
      selector: '#ContentPlaceHolder1_PayoutDropDownList',
      valueKey: 'Payout ID',
      labelKey: 'Payout Label',
      searchAfterSelect: true,
    },
  }),
  mod('bp_sale_performance', 'BP Sale Performance', ['BP Management', 'BP Sale Performance']),
  mod('bp_summary_fin_year', 'BP Summary (Fin. Year)', ['BP Management', 'BP Summary (Fin. Year)']),
  mod('bp_award_shares', 'BP Award Shares', ['BP Management', 'BP Award Shares']),
  mod('site_visit_expense', 'Site Visit Expense', ['BP Management', 'Site Visit Expense']),
  // BP Payout
  mod('income_details', 'Income Details', ['BP Payout', 'Income Details'], {
    dropdownIterate: {
      selector: '#ContentPlaceHolder1_DropDownList1, #ContentPlaceHolder1_PayoutDropDownList',
      valueKey: 'Payout ID',
      labelKey: 'Payout Label',
      searchAfterSelect: true,
    },
  }),
  mod('downline_income_summary', 'Downline Income Summary', ['BP Payout', 'Downline Income Summary'], {
    dropdownIterate: {
      selector: '#ContentPlaceHolder1_DropDownList1',
      valueKey: 'Payout ID',
      labelKey: 'Payout Label',
      searchAfterSelect: true,
    },
  }),
  mod('bp_income_details', 'BP Income Details', ['BP Payout', 'BP Income Details']),
  mod('payout_balance_sheet', 'Payout Balance Sheet', ['BP Payout', 'Payout Balance Sheet']),
  mod('neft_list_reward_emi', 'NEFT List (Reward EMI)', ['BP Payout', 'NEFT List (Reward EMI)']),
  mod('reward_emi_reward_wise', 'Reward EMI (Reward Wise)', ['BP Payout', 'Reward EMI (Reward Wise)']),
  mod('payout_income_summary', 'Income Summary', ['BP Payout', 'Income Summary'], {
    dropdownIterate: {
      selector: '#ContentPlaceHolder1_DropDownList1',
      valueKey: 'Payout ID',
      labelKey: 'Payout Label',
      searchAfterSelect: true,
    },
  }),
  mod('reward_booking_details', 'Reward Booking Details', ['BP Payout', 'Reward Booking Details']),
  mod('reward_emi_details', 'Reward EMI Details', ['BP Payout', 'Reward EMI Details']),
  mod('reward_emi_not_achieved', 'Reward EMI Not Achieved', ['BP Payout', 'Reward EMI Not Achieved']),
  mod('neft_list_reward', 'NEFT List (Reward)', ['BP Payout', 'NEFT List (Reward)'], {
    dropdownIterate: {
      selector: '#ContentPlaceHolder1_DropDownList1',
      valueKey: 'Payout ID',
      labelKey: 'Payout Label',
      searchAfterSelect: true,
    },
  }),
  mod('reward_setting', 'Reward Setting', ['BP Payout', 'Reward Setting']),
  // Finder & Editor
  mod('finder_accounting_transactions', 'Accounting Transactions', [
    'Finder & Editor',
    'Accounting Transactions',
  ]),
  mod('accounting_entity', 'Accounting Entity', ['Finder & Editor', 'Accounting Entity']),
  mod('finder_sales_transaction', 'Sales Transaction', ['Finder & Editor', 'Sales Transaction']),
  mod('finder_sales', 'Sales', ['Finder & Editor', 'Sales']),
  // Joining Pin
  mod('epin_list', 'E-Pin List', ['Joining Pin', 'E-Pin List']),
  mod('pin_generator_transfer', 'PIN Generator & Transfer', ['Joining Pin', 'PIN Generator & Transfer']),
  mod('transfer_epin', 'Transfer E-PIN', ['Joining Pin', 'Transfer E-PIN']),
  mod('epin_request_details', 'E-PIN Request Details', ['Joining Pin', 'E-PIN Request Details']),
  // Master
  mod('project_phase', 'Project Phase', ['Master', 'Project Phase'], { schedule: 'weekly' }),
  mod('project', 'Project', ['Master', 'Project'], { schedule: 'weekly' }),
  mod('branch', 'Branch', ['Master', 'Branch'], { schedule: 'weekly' }),
  mod('accounting_head', 'Accounting Head', ['Master', 'Accounting Head'], { schedule: 'weekly' }),
  // Raw Management
  mod('registry_list', 'Registry List', ['Raw Management', 'Registry List']),
  mod('govt_survey_plot', 'Govt. Survey Plot', ['Raw Management', 'Govt. Survey Plot'], {
    extractMode: 'grid',
    dropdownIterate: [
      {
        selector: '#ContentPlaceHolder1_ProjectMainDropDownList',
        valueKey: 'Project ID',
        labelKey: 'Project',
        searchAfterSelect: false,
        waitForOptionsSelector: '#ContentPlaceHolder1_ProjectPhaseDropDownList',
      },
      {
        selector: '#ContentPlaceHolder1_ProjectPhaseDropDownList',
        valueKey: 'Phase ID',
        labelKey: 'Phase',
        searchAfterSelect: true,
        extractAs: 'grid',
      },
    ],
  }),
  mod('plot_list', 'Plot List', ['Raw Management', 'Plot List'], {
    extractMode: 'grid',
    dropdownIterate: [
      {
        selector: '#ContentPlaceHolder1_ProjectMainDropDownList',
        valueKey: 'Project ID',
        labelKey: 'Project',
        searchAfterSelect: false,
        waitForOptionsSelector: '#ContentPlaceHolder1_ProjectPhaseDropDownList',
      },
      {
        selector: '#ContentPlaceHolder1_ProjectPhaseDropDownList',
        valueKey: 'Phase ID',
        labelKey: 'Phase',
        searchAfterSelect: true,
        extractAs: 'grid',
      },
    ],
  }),
  mod('registered_plot_list', 'Registered Plot List', ['Raw Management', 'Registered Plot List'], {
    extractMode: 'grid',
    dropdownIterate: [
      {
        selector: '#ContentPlaceHolder1_ProjectMainDropDownList',
        valueKey: 'Project ID',
        labelKey: 'Project',
        searchAfterSelect: false,
        waitForOptionsSelector: '#ContentPlaceHolder1_ProjectPhaseDropDownList',
      },
      {
        selector: '#ContentPlaceHolder1_ProjectPhaseDropDownList',
        valueKey: 'Phase ID',
        labelKey: 'Phase',
        searchAfterSelect: true,
        extractAs: 'grid',
      },
    ],
  }),
  mod('raw_land_broker', 'Raw Land Broker', ['Raw Management', 'Raw Land Broker']),
  mod('raw_land_owner', 'Raw Land Owner', ['Raw Management', 'Raw Land Owner']),
  mod('raw_land', 'Raw Land', ['Raw Management', 'Raw Land'], {
    extractMode: 'form',
    dropdownIterate: [
      {
        selector: '#ContentPlaceHolder1_SearchProjectMainDropDownList',
        valueKey: 'Project ID',
        labelKey: 'Project',
        searchAfterSelect: true,
        waitForOptionsSelector: '#ContentPlaceHolder1_PhaseDropDownList',
      },
      {
        selector: '#ContentPlaceHolder1_PhaseDropDownList',
        valueKey: 'Phase ID',
        labelKey: 'Phase',
        searchAfterSelect: true,
        extractAs: 'form',
      },
    ],
  }),
  mod('raw_payments', 'Raw Payments', ['Raw Management', 'Raw Payments']),
  // Sale Report
  mod('booking_performance', 'Booking Performance', ['Sale Report', 'Booking Performance']),
  mod('sale_report_daily', 'Daily Report', ['Sale Report', 'Daily Report'], {
    tableType: 'report-filter',
    backfill: { type: 'daily', startStrategy: 'erp_min' },
  }),
  mod('sale_report_monthly', 'Monthly Report', ['Sale Report', 'Monthly Report'], {
    tableType: 'report-filter',
    backfill: { type: 'monthly', startStrategy: 'erp_min' },
  }),
  mod('sale_report_yearly', 'Yearly Report', ['Sale Report', 'Yearly Report'], {
    tableType: 'report-filter',
    backfill: { type: 'yearly', startStrategy: 'erp_min' },
  }),
  mod('sale_report_transactions', 'Sale Transactions', ['Sale Report', 'Sale Transactions']),
  mod('sales_performance_report', 'Sales Performance Report', ['Sale Report', 'Sales Performance Report']),
  mod('sales_accounts_report', 'Sales Accounts Report', ['Sale Report', 'Sales Accounts Report']),
];

const moduleMap = new Map<string, ModuleConfig>();
for (const m of ADMIN_MODULES) {
  moduleMap.set(m.key, m);
}

export function getModuleConfig(key: string): ModuleConfig | undefined {
  const config = moduleMap.get(key);
  if (!config) return undefined;
  return enrichModuleFromGenerated(config);
}

export function getAllAdminModules(): ModuleConfig[] {
  return ADMIN_MODULES;
}

export function getModulesBySchedule(schedule: ModuleConfig['schedule']): ModuleConfig[] {
  return ADMIN_MODULES.filter((m) => m.schedule === schedule);
}

export function getBackfillModules(): ModuleConfig[] {
  return ADMIN_MODULES.filter((m) => m.backfill && m.backfill.type !== 'none');
}

/** Full portal scrape order: BP List first, then other BP Management, then all remaining modules. */
export function getSequentialAdminModules(): ModuleConfig[] {
  const ordered: ModuleConfig[] = [];
  const seen = new Set<string>();

  const bpList = moduleMap.get('bp_list');
  if (bpList) {
    ordered.push(enrichModuleFromGenerated(bpList));
    seen.add('bp_list');
  }

  for (const m of ADMIN_MODULES) {
    if (seen.has(m.key)) continue;
    if (m.navPath[0] === 'BP Management') {
      ordered.push(enrichModuleFromGenerated(m));
      seen.add(m.key);
    }
  }

  for (const m of ADMIN_MODULES) {
    if (seen.has(m.key)) continue;
    ordered.push(enrichModuleFromGenerated(m));
    seen.add(m.key);
  }

  return ordered;
}
