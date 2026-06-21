import type { Page } from 'playwright';
import type { ModuleConfig, ExtractResult } from '@greencity/shared';
import { mergeSelectors, jitteredDelay, loadConfig } from '@greencity/shared';
import { extractGridFromDom } from './dom-grid.js';
import { extractAttachmentLinksFn } from './dom-grid.browser.js';

export async function extractFormFields(page: Page, config: ModuleConfig): Promise<ExtractResult> {
  const row = await page.evaluate(() => {
    const strip = (s: string) => s.replace(/\s+/g, ' ').trim();
    const fields: Record<string, string> = {};
    const form = document.getElementById('aspnetForm') ?? document.querySelector('form');
    if (!form) return fields;

    form.querySelectorAll('input, select, textarea').forEach((el) => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (input.type === 'hidden') return;
      const id = input.id || input.name;
      if (!id) return;
      const label =
        form.querySelector(`label[for="${input.id}"]`)?.textContent ??
        input.getAttribute('placeholder') ??
        id;
      const key = strip(label);
      if (input instanceof HTMLSelectElement) {
        fields[key] = strip(input.options[input.selectedIndex]?.text ?? input.value);
      } else {
        fields[key] = strip(input.value ?? '');
      }
    });

    return fields;
  });

  const hasData = Object.values(row).some((v) => v.length > 0);
  return {
    rows: hasData ? [{ data: row }] : [],
    pagesScraped: 1,
    columnWarnings: hasData ? [] : ['No form fields found'],
    usedExport: false,
  };
}

export async function extractAttachmentMetadata(
  page: Page,
  config: ModuleConfig,
): Promise<ExtractResult> {
  const links = await page.evaluate(extractAttachmentLinksFn);

  return {
    rows: links.map((l) => ({ data: { label: l.label, href: l.href, _type: 'attachment' } })),
    pagesScraped: 1,
    columnWarnings: [],
    usedExport: false,
  };
}

export async function followDetailLinks(
  page: Page,
  config: ModuleConfig,
  parentRows: Record<string, string>[],
): Promise<ExtractResult['rows']> {
  const selectors = mergeSelectors(config.selectors);
  const detailColumn = selectors.detailLinkColumn ?? config.primaryKey[0];
  if (!detailColumn) return [];

  const cfg = loadConfig();
  const detailRows: ExtractResult['rows'] = [];
  const maxDetails = 50;

  for (let i = 0; i < Math.min(parentRows.length, maxDetails); i++) {
    const parent = parentRows[i];
    const hrefKey = `${detailColumn}_href`;
    const href = parent[hrefKey];
    if (!href) continue;

    const detailPage = await page.context().newPage();
    try {
      await detailPage.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await jitteredDelay(cfg.scraperDelayMs);
      const formResult = await extractFormFields(detailPage, config);
      for (const r of formResult.rows) {
        detailRows.push({
          data: {
            ...r.data,
            _parentKeys: JSON.stringify(
              config.primaryKey.reduce((acc, k) => ({ ...acc, [k]: parent[k] ?? '' }), {}),
            ),
            _detailUrl: href,
          },
        });
      }
    } catch {
      // skip failed detail pages
    } finally {
      await detailPage.close();
    }
  }

  return detailRows;
}
