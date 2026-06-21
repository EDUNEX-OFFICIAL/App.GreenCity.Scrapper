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
  pageStart?: number;
  pageEnd?: number;
}
