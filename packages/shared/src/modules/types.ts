export type Portal = 'admin' | 'bp';

import type { ExtractMode, PageSelectors } from '../selectors/types.js';

export type TableType = 'grid' | 'paginated-grid' | 'report-filter';

export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly';

export type { ExtractMode, PageSelectors };

export interface BackfillConfig {
  type: 'none' | 'daily' | 'monthly' | 'yearly';
  startStrategy: 'erp_min' | 'fixed';
  fixedFrom?: string;
}

export type PagingMode = 'auto' | 'lblPaging' | 'inline-grid';

export interface DropdownIterateConfig {
  /** CSS selector for the dropdown, e.g. #ContentPlaceHolder1_PayoutDropDownList */
  selector: string;
  /** rowJson key for selected option value (default: Payout ID) */
  valueKey?: string;
  /** rowJson key for selected option label (default: Payout Label) */
  labelKey?: string;
  /** Click search/show after selecting this dropdown (default: true for last in chain) */
  searchAfterSelect?: boolean;
  /** Extract form fields instead of grid at this step (or final step when set). */
  extractAs?: 'form' | 'grid';
  /** Wait for this selector to have >0 options after select (ASP.NET cascade dropdowns). */
  waitForOptionsSelector?: string;
}

export interface ModuleConfig {
  key: string;
  portal: Portal;
  label: string;
  navPath: string[];
  directUrl?: string;
  tableType: TableType;
  schedule: ScheduleFrequency;
  primaryKey: string[];
  backfill?: BackfillConfig;
  wave?: 1 | 2 | 3;
  selectors?: PageSelectors;
  extractMode?: ExtractMode;
  maxPages?: number;
  pagingMode?: PagingMode;
  upsertPerPage?: boolean;
  /** Iterate dropdown options and scrape grid for each selection. */
  dropdownIterate?: DropdownIterateConfig | DropdownIterateConfig[];
}

export interface ScrapeJobPayload {
  moduleKey: string;
  portal: Portal;
  bpCode?: string;
  dateFrom?: string;
  dateTo?: string;
  runId?: string;
  triggeredBy?: string;
  pageStart?: number;
  pageEnd?: number;
  sessionSuffix?: string;
  /** Skip these module keys in portal_sequential jobs (e.g. bp_list already done). */
  skipModuleKeys?: string[];
}

export interface ExtractedRow {
  data: Record<string, string>;
  sourcePage?: number;
}

export interface ExtractResult {
  rows: ExtractedRow[];
  pagesScraped: number;
  columnWarnings: string[];
  usedExport: boolean;
  rowsInserted?: number;
  rowsUpdated?: number;
}

export interface ExtractOptions {
  onPage?: (rows: Record<string, string>[], pageNum: number) => Promise<void>;
  onPageFailed?: (pageNum: number, error: string) => Promise<void>;
  onDetailFailed?: (identifiers: Record<string, string>, error: string) => Promise<void>;
  pageStart?: number;
  pageEnd?: number;
  /** Skip dismissModals/search when caller already applied pre-actions (dropdown iterate). */
  skipPreActions?: boolean;
}
