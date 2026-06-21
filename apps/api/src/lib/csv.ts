export function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: Record<string, string>[], headers?: string[]): string {
  const headerSet = new Set<string>(headers ?? []);
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!key.endsWith('_href') && !key.endsWith('_value')) headerSet.add(key);
    }
  }
  const cols = headers ?? [...headerSet].sort();
  const lines = [cols.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(cols.map((h) => escapeCsvCell(row[h] ?? '')).join(','));
  }
  return lines.join('\n');
}
