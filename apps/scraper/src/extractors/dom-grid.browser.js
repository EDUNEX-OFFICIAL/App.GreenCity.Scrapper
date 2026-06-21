/** Browser-side helpers — plain JS so Playwright evaluate is not transformed by tsx/esbuild. */

export function extractGridFromDomFn(table) {
  const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const isPagerCells = (cells) => {
    const nonEmpty = cells.filter((c) => c.length > 0);
    if (nonEmpty.length === 0) return true;
    const pagerLike = nonEmpty.filter(
      (c) => /^\d+$/.test(c) || c === '...' || c === '>>' || c === '<<' || c === '&gt;&gt;',
    );
    return pagerLike.length >= nonEmpty.length * 0.7;
  };

  const isHeaderCells = (cells) => {
    const headerPattern =
      /^(Sr\.?\s*No|SrNo|UID|BP ID|Name|Mobile|Sponsor|Password|Add On|Status|Current|Trans ID|Voucher|Booking|Sale ID)/i;
    return cells.some((c) => headerPattern.test(c));
  };

  const allRows = Array.from(table.querySelectorAll('tr'));
  const headers = [];
  let headerRowIndex = -1;

  const thead = table.querySelector('thead');
  if (thead) {
    thead.querySelectorAll('th').forEach((th) => headers.push(strip(th.innerHTML)));
  }

  if (headers.length === 0) {
    for (let i = 0; i < allRows.length; i++) {
      const cells = Array.from(allRows[i].querySelectorAll('th, td')).map((c) => strip(c.innerHTML));
      if (cells.length === 0 || isPagerCells(cells)) continue;
      if (allRows[i].querySelector('th') || isHeaderCells(cells) || cells.some((c) => /[a-zA-Z]{2,}/.test(c))) {
        headers.push(...cells);
        headerRowIndex = i;
        break;
      }
    }
  }

  const rows = [];
  for (let i = 0; i < allRows.length; i++) {
    if (i === headerRowIndex) continue;
    const tr = allRows[i];
    const cells = Array.from(tr.querySelectorAll('td')).map((td) => strip(td.innerHTML));
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
