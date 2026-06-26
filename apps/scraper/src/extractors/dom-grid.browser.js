/** Browser-side helpers — plain JS so Playwright evaluate is not transformed by tsx/esbuild. */

export function extractGridFromDomFn(table) {
  const strip = (s) =>
    s
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

  const isPagerCells = (cells) => {
    const nonEmpty = cells.filter((c) => c.length > 0);
    if (nonEmpty.length === 0) return true;
    // Plot / booking rows: RA-1001, RC-1223, etc.
    if (nonEmpty.some((c) => /[A-Za-z]+-\d+/.test(c))) return false;
    const pagerLike = nonEmpty.filter(
      (c) =>
        /^\d+$/.test(c) ||
        c === '...' ||
        c === '>>' ||
        c === '<<' ||
        c === '&gt;&gt;' ||
        />>|<</.test(c) ||
        /^\d{6,}/.test(c),
    );
    return pagerLike.length >= nonEmpty.length * 0.7;
  };

  const isHeaderCells = (cells) => {
    const headerPattern =
      /^(Option|Sr\.?\s*No|SrNo|Sl\.?\s*No|SlNo|UID|BP ID|Name|Point|Plot|Mobile|Sponsor|Password|Add On|Status|Current|Trans ID|Voucher|Booking|Sale ID|Area)/i;
    if (cells.some((c) => headerPattern.test(c))) return true;
    const joined = cells.join(' ').toLowerCase();
    return joined.includes('slno') && joined.includes('name');
  };

  const allRows = Array.from(table.querySelectorAll('tr'));
  const headers = [];
  let headerRowIndex = -1;

  const thead = table.querySelector('thead');
  if (thead) {
    thead.querySelectorAll('th').forEach((th) => headers.push(strip(th.textContent || '')));
  }
  if (headers.length > 0 && !isHeaderCells(headers)) {
    headers.length = 0;
  }

  if (headers.length === 0) {
    for (let i = 0; i < allRows.length; i++) {
      const cells = Array.from(allRows[i].querySelectorAll('th, td')).map((c) => strip(c.textContent || ''));
      if (cells.length === 0 || isPagerCells(cells)) continue;
      if (allRows[i].querySelector('th') || isHeaderCells(cells)) {
        headers.push(...cells);
        headerRowIndex = i;
        break;
      }
    }
  } else {
    for (let i = 0; i < allRows.length; i++) {
      const cells = Array.from(allRows[i].querySelectorAll('th, td')).map((c) => strip(c.textContent || ''));
      if (allRows[i].querySelector('th') && isHeaderCells(cells)) {
        headerRowIndex = i;
        break;
      }
    }
  }

  const rows = [];
  for (let i = 0; i < allRows.length; i++) {
    if (headerRowIndex >= 0 && i <= headerRowIndex) continue;
    const tr = allRows[i];
    const cells = Array.from(tr.querySelectorAll('td')).map((td) => strip(td.textContent || ''));
    if (cells.length === 0) continue;
    if (isPagerCells(cells)) continue;

    const row = {};
    cells.forEach((cell, idx) => {
      const key = headers[idx] || `col_${idx}`;
      row[key] = cell;
      const td = tr.querySelectorAll('td')[idx];
      const link = td?.querySelector('a[href]');
      if (link?.href && !link.href.startsWith('javascript:')) {
        row[`${key}_href`] = link.href;
      }
    });
    if (Object.values(row).some((v) => v.length > 0)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    for (let i = 0; i < allRows.length; i++) {
      const hdrCells = Array.from(allRows[i].querySelectorAll('th, td')).map((c) => strip(c.textContent || ''));
      if (!isHeaderCells(hdrCells)) continue;
      for (let j = i + 1; j < allRows.length; j++) {
        const dataCells = Array.from(allRows[j].querySelectorAll('td')).map((td) => strip(td.textContent || ''));
        if (dataCells.length === 0 || isPagerCells(dataCells)) continue;
        const row = {};
        dataCells.forEach((cell, idx) => {
          row[hdrCells[idx] || `col_${idx}`] = cell;
        });
        if (Object.values(row).some((v) => v.length > 0)) rows.push(row);
      }
      if (rows.length > 0) {
        headers.length = 0;
        headers.push(...hdrCells);
        break;
      }
    }
  }

  return { headers, rows };
}

export function readInlineGridPagingFn(table) {
  const pageNumbers = new Set();
  let currentPage = 1;
  let hasNext = false;

  table.querySelectorAll('a[href*="Page$"]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const m = href.match(/Page\$(\d+)/);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) pageNumbers.add(n);
    }
    const text = (a.textContent || '').trim();
    if (text === '>>' || text === '...') hasNext = true;
  });

  table.querySelectorAll('tr').forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll('td'));
    const cellTexts = cells.map((c) => (c.textContent || '').trim());
    const pagerLike = cellTexts.filter(
      (t) => /^\d+$/.test(t) || t === '...' || t === '>>' || t === '<<',
    );
    if (pagerLike.length < Math.max(3, cellTexts.length * 0.5)) return;

    cells.forEach((cell) => {
      const span = cell.querySelector('span');
      const link = cell.querySelector('a[href*="Page$"]');
      if (span && !link) {
        const n = Number.parseInt((span.textContent || '').trim(), 10);
        if (Number.isFinite(n) && n > 0) currentPage = n;
      }
    });

    if (cellTexts.some((t) => t === '>>')) hasNext = true;
  });

  const sorted = [...pageNumbers].sort((a, b) => a - b);
  if (sorted.some((n) => n > currentPage)) hasNext = true;

  return { currentPage, pageNumbers: sorted, hasNext };
}

export function extractAttachmentLinksFn() {
  const strip = (s) => s.replace(/\s+/g, ' ').trim();
  return Array.from(
    document.querySelectorAll('a[href*="download" i], a[href*="Attachment" i], a[href*=".pdf" i]'),
  ).map((a) => ({
    label: strip(a.textContent || ''),
    href: a.href,
  }));
}
