export type ExtractMode = 'grid' | 'report' | 'form' | 'export-first' | 'detail-chain';

export type PageTemplate =
  | 'simple-grid'
  | 'paginated-grid'
  | 'report-filter'
  | 'form-view'
  | 'export-only'
  | 'unknown';

export interface PageSelectors {
  grid?: string;
  pagingLabel?: string;
  viewAll?: string;
  searchButton?: string;
  searchInput?: string;
  settingsButton?: string;
  panelMenuItem?: string;
  memberOpenModal?: string;
  panelClickHere?: string;
  exportButton?: string;
  dismissModals?: string[];
  detailLinkColumn?: string;
}

export interface GridTableInfo {
  id: string;
  rowCount: number;
  headers: string[];
}

export interface FormFieldInfo {
  id: string;
  name: string;
  type: string;
  label: string;
  value: string;
}

export interface PageInspectResult {
  moduleKey: string;
  url: string;
  title: string;
  template: PageTemplate;
  gridTables: GridTableInfo[];
  pagingLabel: string | null;
  viewAllVisible: boolean;
  exportButton: string | null;
  searchControls: string[];
  modals: string[];
  detailLinks: string[];
  formFields: FormFieldInfo[];
  attachments: string[];
  suggestedSelectors: PageSelectors;
  extractMode: ExtractMode;
  inspectedAt: string;
}

export const DEFAULT_SELECTORS: PageSelectors = {
  grid: 'table[id*="GridView1"], table[id*="GridView"], table[id*="grd"]',
  pagingLabel: '[id*="lblPaging"]',
  viewAll: 'a[id*="lbtnAll"], [id*="lbtnAll"]',
  searchButton:
    'input[type="submit"][value*="Search" i], input[id*="btnSearch" i], input[value*="Show" i], button:has-text("Search")',
  exportButton: '[id*="Export"], input[value*="Export" i], a[id*="lbtnExport"]',
  dismissModals: [
    '#MemberOpenModal .close',
    '#MemberOpenModal button[data-dismiss="modal"]',
    '.modal.show button.close',
  ],
};

export function mergeSelectors(custom?: PageSelectors): Required<Omit<PageSelectors, 'detailLinkColumn'>> & {
  detailLinkColumn?: string;
} {
  return {
    grid: custom?.grid ?? DEFAULT_SELECTORS.grid!,
    pagingLabel: custom?.pagingLabel ?? DEFAULT_SELECTORS.pagingLabel!,
    viewAll: custom?.viewAll ?? DEFAULT_SELECTORS.viewAll!,
    searchButton: custom?.searchButton ?? DEFAULT_SELECTORS.searchButton!,
    searchInput: custom?.searchInput ?? '#ContentPlaceHolder1_SearchTextBox',
    settingsButton: custom?.settingsButton ?? '.dropdown-toggle',
    panelMenuItem: custom?.panelMenuItem ?? 'a:has-text("Panel")',
    memberOpenModal: custom?.memberOpenModal ?? '#MemberOpenModal',
    panelClickHere:
      custom?.panelClickHere ??
      '#MemberOpenModal a:has-text("Click Here"), #MemberOpenModal input[value*="Click" i]',
    exportButton: custom?.exportButton ?? DEFAULT_SELECTORS.exportButton!,
    dismissModals: custom?.dismissModals ?? DEFAULT_SELECTORS.dismissModals ?? [],
    detailLinkColumn: custom?.detailLinkColumn,
  };
}
