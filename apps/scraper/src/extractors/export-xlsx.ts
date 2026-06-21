import type { Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import type { ModuleConfig, ExtractResult } from '@greencity/shared';
import { mergeSelectors } from '@greencity/shared';

export async function tryExportAndParse(
  page: Page,
  config: ModuleConfig,
): Promise<ExtractResult | null> {
  const selectors = mergeSelectors(config.selectors);
  const exportBtn = page.locator(selectors.exportButton).first();
  if ((await exportBtn.count()) === 0) return null;
  if (!(await exportBtn.isVisible().catch(() => false))) return null;

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
    exportBtn.click(),
  ]);

  if (!download) return null;

  const suggested = download.suggestedFilename();
  const filePath = await download.path();
  if (!filePath) {
    return {
      rows: [{ data: { _export_file: suggested, _export_path: '' } }],
      pagesScraped: 1,
      columnWarnings: ['Export download path unavailable'],
      usedExport: true,
    };
  }

  if (/\.xlsx?$/i.test(suggested) || /\.xlsx?$/i.test(filePath)) {
    try {
      const rows = await parseXlsxFile(filePath);
      return {
        rows: rows.map((data) => ({ data })),
        pagesScraped: 1,
        columnWarnings: [],
        usedExport: true,
      };
    } catch (err) {
      return {
        rows: [{ data: { _export_file: suggested, _export_path: filePath } }],
        pagesScraped: 1,
        columnWarnings: [`XLSX parse failed: ${err instanceof Error ? err.message : String(err)}`],
        usedExport: true,
      };
    }
  }

  return {
    rows: [{ data: { _export_file: suggested, _export_path: filePath } }],
    pagesScraped: 1,
    columnWarnings: [],
    usedExport: true,
  };
}

async function parseXlsxFile(filePath: string): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx');
  const buffer = await readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return json.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[String(k).trim()] = String(v ?? '').trim();
    }
    return out;
  });
}

export { parseXlsxFile };
