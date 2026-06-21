import type { PageSelectors } from './types.js';

/** Hand-tuned selectors for Wave 1 modules (refined by cli-inspect output) */
export const MODULE_SELECTOR_OVERRIDES: Record<string, PageSelectors> = {
  sale_list: {
    grid: '#ContentPlaceHolder1_GridView1, table[id*="GridView1"]',
    pagingLabel: '#ContentPlaceHolder1_lblPaging, [id*="lblPaging"]',
    viewAll: '#ContentPlaceHolder1_lbtnAll, [id*="lbtnAll"]',
    searchButton:
      '#ContentPlaceHolder1_btnShow, #ContentPlaceHolder1_btnSearch, input[id*="btnSearch"], input[value*="Search" i], input[value*="Show" i]',
    detailLinkColumn: 'Booking No',
  },
  accounting_transactions: {
    grid: '#ContentPlaceHolder1_GridView1, table[id*="GridView1"]',
    pagingLabel: '#ContentPlaceHolder1_lblPaging, [id*="lblPaging"]',
    viewAll: '#ContentPlaceHolder1_lbtnAll, [id*="lbtnAll"]',
    searchButton:
      '#ContentPlaceHolder1_btnSearch, input[id*="btnSearch"], input[value*="Search" i], input[value*="Show" i]',
  },
  bp_list: {
    grid: '#ContentPlaceHolder1_GridView1, table[id*="GridView1"]',
    pagingLabel: '#ContentPlaceHolder1_lblPaging, [id*="lblPaging"]',
    searchButton:
      '#ContentPlaceHolder1_SearchButton, #ContentPlaceHolder1_btnSearch, input[id*="SearchButton" i], input[value="SEARCH" i], input[value*="Search" i]',
    searchInput: '#ContentPlaceHolder1_SearchTextBox, input[id*="SearchTextBox" i]',
    settingsButton: 'input[id*="Settings" i], button[id*="Settings" i], a[id*="Settings" i], .dropdown-toggle',
    panelMenuItem: 'a:has-text("Panel"), li:has-text("Panel") a, .dropdown-menu a:has-text("Panel")',
    memberOpenModal: '#MemberOpenModal',
    panelClickHere:
      '#MemberOpenModal a:has-text("Click Here"), #MemberOpenModal input[value*="Click" i], #MemberOpenModal button:has-text("Click Here")',
    dismissModals: [
      '.modal.show .close:not(#MemberOpenModal .close)',
      '.modal.show button[data-dismiss="modal"]:not(#MemberOpenModal button)',
    ],
  },
  neft_list: {
    grid: '#ContentPlaceHolder1_GridView1, table[id*="GridView1"]',
    pagingLabel: '#ContentPlaceHolder1_lblPaging, [id*="lblPaging"]',
    viewAll: '#ContentPlaceHolder1_lbtnAll, [id*="lbtnAll"]',
  },
  master_bank: {
    grid: '#ContentPlaceHolder1_GridView1, table[id*="GridView1"]',
  },
  branch: {
    grid: '#ContentPlaceHolder1_GridView1, table[id*="GridView1"]',
  },
};

export function getModuleSelectorOverrides(moduleKey: string): PageSelectors | undefined {
  return MODULE_SELECTOR_OVERRIDES[moduleKey];
}
