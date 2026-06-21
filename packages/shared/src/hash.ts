import { createHash } from 'node:crypto';

export type NormalizedRow = Record<string, string>;

export function normalizeRow(row: Record<string, string>): NormalizedRow {
  const out: NormalizedRow = {};
  for (const key of Object.keys(row).sort()) {
    out[key] = String(row[key] ?? '').trim();
  }
  return out;
}

export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

export interface RowHashScope {
  moduleKey: string;
  portal: string;
  bpCode?: string | null;
}

export function computeRowHash(row: NormalizedRow, scope?: RowHashScope): string {
  const payload = scope
    ? {
        moduleKey: scope.moduleKey,
        portal: scope.portal,
        bpCode: scope.bpCode ?? null,
        row: normalizeRow(row),
      }
    : normalizeRow(row);
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}
