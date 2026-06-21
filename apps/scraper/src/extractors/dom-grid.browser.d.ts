export function extractGridFromDomFn(table: HTMLTableElement): {
  headers: string[];
  rows: Record<string, string>[];
};

export function readInlineGridPagingFn(table: HTMLTableElement): {
  currentPage: number;
  pageNumbers: number[];
  hasNext: boolean;
};

export function extractAttachmentLinksFn(): Array<{ label: string; href: string }>;
