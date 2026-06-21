/** Parse hidden ASP.NET form fields from HTML */
export function parseHiddenInputs(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const re = /<input[^>]*type=["']hidden["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    const nameMatch = /name=["']([^"']+)["']/i.exec(tag);
    const valueMatch = /value=["']([^"']*)["']/i.exec(tag);
    if (nameMatch) {
      fields[nameMatch[1]] = valueMatch?.[1] ?? '';
    }
  }
  return fields;
}

/** All named inputs inside #aspnetForm */
export function parseAspNetFormFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const formMatch = html.match(/<form[^>]*id=["']aspnetForm["'][^>]*>([\s\S]*?)<\/form>/i);
  const scope = formMatch?.[1] ?? html;
  const inputRe = /<input\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = inputRe.exec(scope)) !== null) {
    const attrs = match[1];
    const nameMatch = /name=["']([^"']+)["']/i.exec(attrs);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const typeMatch = /type=["']([^"']+)["']/i.exec(attrs);
    const type = (typeMatch?.[1] ?? 'text').toLowerCase();
    if (type === 'submit' || type === 'button' || type === 'image' || type === 'file') continue;

    const valueMatch = /value=["']([^"']*)["']/i.exec(attrs);
    const value = valueMatch?.[1] ?? '';
    const checked = /\bchecked\b/i.test(attrs);

    if (type === 'radio' || type === 'checkbox') {
      if (checked) fields[name] = value;
      continue;
    }
    fields[name] = value;
  }

  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((match = selectRe.exec(scope)) !== null) {
    const attrs = match[1];
    const body = match[2];
    const nameMatch = /name=["']([^"']+)["']/i.exec(attrs);
    if (!nameMatch) continue;
    const selected =
      body.match(/<option[^>]*\bselected\b[^>]*value=["']([^"']*)["']/i) ??
      body.match(/<option[^>]*value=["']([^"']*)["']/i);
    if (selected) {
      fields[nameMatch[1]] = selected[1];
    }
  }

  return fields;
}

export interface PortalPaging {
  start: number;
  end: number;
  total: number;
}

export function parsePortalPaging(html: string): PortalPaging | null {
  const label =
    html.match(/id=["'][^"']*lblPaging["'][^>]*>([\s\S]*?)<\/span>/i) ??
    html.match(/id=["']ctl00_MainContent_lblPaging["'][^>]*>([\s\S]*?)<\/span>/i);
  const text = label?.[1] ?? '';
  const withBold = text.match(
    /Results\s*<b>\s*(\d+)\s*<\/b>\s*-\s*<b>\s*(\d+)\s*<\/b>\s*Of\s*<b>\s*(\d+)\s*<\/b>/i,
  );
  const plain = text.match(/Results\s+(\d+)\s*-\s*(\d+)\s+Of\s+(\d+)/i);
  const match = withBold ?? plain;
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  const total = Number.parseInt(match[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(total)) return null;
  return { start, end, total };
}

export function isPagingComplete(paging: PortalPaging | null, visibleEnd: number): boolean {
  if (!paging) return true;
  if (paging.total <= 0) return true;
  return visibleEnd >= paging.total;
}

export function parseGridPageNumbers(html: string): number[] {
  const pages = new Set<number>();
  const re = /__doPostBack\([^,]+,\s*(?:'|&#39;)Page\$(\d+)(?:'|&#39;)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n) && n > 1) pages.add(n);
  }
  return [...pages].sort((a, b) => a - b);
}

export function hasViewAllLink(html: string): boolean {
  return /id=["'][^"']*lbtnAll["']/i.test(html) || /lbtnAll/i.test(html);
}

/** Detect ASP.NET GridView __EVENTTARGET from page HTML */
export function detectGridEventTarget(html: string): string {
  const gridView = html.match(/__doPostBack\(['"](ctl00\$[^'"]*GridView\d*)['"]/i);
  if (gridView) return gridView[1];
  const grd = html.match(/__doPostBack\(['"](ctl00\$[^'"]*grd[^'"]*)['"]/i);
  if (grd) return grd[1];
  return 'ctl00$ContentPlaceHolder1$GridView1';
}

export function detectViewAllTarget(html: string): string | null {
  const m = html.match(/id=["']([^"']*lbtnAll)["']/i);
  if (!m) return null;
  return m[1].replace(/_/g, '$');
}

export const GRID_EVENT_TARGET = 'ctl00$ContentPlaceHolder1$GridView1';
export const VIEW_ALL_TARGET = 'ctl00$ContentPlaceHolder1$lbtnAll';

export function buildPostBackFields(
  html: string,
  eventTarget: string,
  eventArgument = '',
): Record<string, string> {
  const fields = parseAspNetFormFields(html);
  fields['__EVENTTARGET'] = eventTarget;
  fields['__EVENTARGUMENT'] = eventArgument;
  return fields;
}

export function fieldsToUrlEncoded(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

/** Parse HTML table into rows keyed by header text */
export function parseHtmlTable(html: string): { headers: string[]; rows: Record<string, string>[] } {
  const tables = extractAllTables(html);
  if (tables.length === 0) return { headers: [], rows: [] };

  let bestTable = tables[0];
  let bestScore = -1;
  for (const t of tables) {
    const score = scoreTable(t);
    if (score > bestScore) {
      bestScore = score;
      bestTable = t;
    }
  }

  return parseSingleTable(bestTable);
}

function extractAllTables(html: string): string[] {
  const tables: string[] = [];
  const re = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    tables.push(match[0]);
  }
  return tables;
}

function scoreTable(tableHtml: string): number {
  if (/GridView\d*|ContentPlaceHolder.*grd/i.test(tableHtml)) return 10_000;
  const tdCount = (tableHtml.match(/<td\b/gi) ?? []).length;
  if (tdCount < 2) return 0;
  const thCount = (tableHtml.match(/<th\b/gi) ?? []).length;
  return tdCount * 10 + thCount * 5;
}

function parseSingleTable(tableHtml: string): { headers: string[]; rows: Record<string, string>[] } {
  const headers: string[] = [];
  const headerMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  if (headerMatch) {
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let m: RegExpExecArray | null;
    while ((m = thRe.exec(headerMatch[1])) !== null) {
      headers.push(stripTags(m[1]).trim());
    }
  }

  if (headers.length === 0) {
    const firstRow = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    if (firstRow) {
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let m: RegExpExecArray | null;
      while ((m = cellRe.exec(firstRow[1])) !== null) {
        headers.push(stripTags(m[1]).trim());
      }
    }
  }

  const rows: Record<string, string>[] = [];
  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const body = tbodyMatch?.[1] ?? tableHtml;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  let rowIndex = 0;
  while ((trMatch = trRe.exec(body)) !== null) {
    if (rowIndex === 0 && !tbodyMatch && headers.length > 0) {
      rowIndex++;
      continue;
    }
    const cells: string[] = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
      cells.push(stripTags(tdMatch[1]).trim());
    }
    if (cells.length === 0) continue;
    const row: Record<string, string> = {};
    cells.forEach((cell, i) => {
      const key = headers[i] || `col_${i}`;
      row[key] = cell;
    });
    rows.push(row);
    rowIndex++;
  }

  return { headers, rows };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function detectExportButton(html: string): string | null {
  const patterns = [
    /id=["']([^"']*(?:btnExport|lbtnExport|Export)[^"']*)["']/i,
    /href=["'][^"']*Export[^"']*["']/i,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m?.[1]) return m[1].replace(/_/g, '$');
  }
  return null;
}
