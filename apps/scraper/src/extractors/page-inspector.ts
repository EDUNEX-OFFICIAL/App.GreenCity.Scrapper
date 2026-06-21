import type { Page } from 'playwright';
import type {
  ExtractMode,
  ModuleConfig,
  PageInspectResult,
  PageTemplate,
  PageSelectors,
} from '@greencity/shared';
import { mergeSelectors } from '@greencity/shared';

function classifyTemplate(
  gridTableCount: number,
  pagingLabel: string | null,
  viewAllVisible: boolean,
  exportButton: string | null,
  formFieldCount: number,
  tableType: ModuleConfig['tableType'],
): PageTemplate {
  if (exportButton && gridTableCount === 0) return 'export-only';
  if (gridTableCount > 0 && (pagingLabel || viewAllVisible || tableType === 'paginated-grid')) {
    return 'paginated-grid';
  }
  if (tableType === 'report-filter') return 'report-filter';
  if (gridTableCount > 0) return 'simple-grid';
  if (formFieldCount > 5) return 'form-view';
  return 'unknown';
}

function templateToExtractMode(template: PageTemplate, tableType: ModuleConfig['tableType']): ExtractMode {
  if (template === 'export-only') return 'export-first';
  if (template === 'report-filter' || tableType === 'report-filter') return 'report';
  if (template === 'form-view') return 'form';
  return 'grid';
}

export async function inspectPage(
  page: Page,
  config: ModuleConfig,
  url: string,
): Promise<PageInspectResult> {
  const selectors = mergeSelectors(config.selectors);

  const gridTables = await page.evaluate(() => {
    const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('table[id*="GridView"], table[id*="grd"]')).map(
      (table) => {
        const headers: string[] = [];
        table.querySelectorAll('thead th, tr:first-child th').forEach((th) => {
          headers.push(strip(th.innerHTML));
        });
        const rowCount = table.querySelectorAll('tbody tr td, tr td').length > 0
          ? table.querySelectorAll('tbody tr').length || table.querySelectorAll('tr').length - 1
          : 0;
        return { id: table.id || '(no id)', rowCount: Math.max(0, rowCount), headers };
      },
    );
  });

  const pagingLabelEl = page.locator(selectors.pagingLabel).first();
  const pagingLabel =
    (await pagingLabelEl.count()) > 0 ? (await pagingLabelEl.innerText()).trim() : null;

  const viewAll = page.locator(selectors.viewAll).first();
  const viewAllVisible = (await viewAll.count()) > 0 && (await viewAll.isVisible().catch(() => false));

  const exportEl = page.locator(selectors.exportButton).first();
  const exportButton =
    (await exportEl.count()) > 0 && (await exportEl.isVisible().catch(() => false))
      ? (await exportEl.getAttribute('id')) ?? 'export'
      : null;

  const searchControls = await page.evaluate(() => {
    const strip = (s: string) => s.replace(/\s+/g, ' ').trim();
    const controls: string[] = [];
    document
      .querySelectorAll(
        'input[type="date"], input[id*="Date" i], select[id*="Month" i], input[id*="btnSearch" i], input[value*="Search" i]',
      )
      .forEach((el) => {
        const id = (el as HTMLElement).id || (el as HTMLInputElement).name;
        if (id) controls.push(id);
      });
    return controls;
  });

  const modals = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.modal.show, .modal[style*="display: block"]')).map(
      (m) => m.id || '(unnamed modal)',
    ),
  );

  const detailLinks = await page.evaluate(() => {
    const links: string[] = [];
    const grid = document.querySelector('table[id*="GridView"]');
    if (!grid) return links;
    grid.querySelectorAll('a[href*=".aspx"]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (href) links.push(href);
    });
    return links.slice(0, 20);
  });

  const formFields = await page.evaluate(() => {
    const strip = (s: string) => s.replace(/\s+/g, ' ').trim();
    const form = document.getElementById('aspnetForm') ?? document.querySelector('form');
    if (!form) return [];
    return Array.from(form.querySelectorAll('input, select, textarea'))
      .filter((el) => (el as HTMLInputElement).type !== 'hidden')
      .slice(0, 40)
      .map((el) => {
        const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const tag = (el as HTMLElement).tagName.toLowerCase();
        return {
          id: input.id,
          name: input.name,
          type: input.type ?? tag,
          label: strip(
            form.querySelector(`label[for="${input.id}"]`)?.textContent ?? input.id ?? input.name,
          ),
          value: strip(input.value ?? ''),
        };
      });
  });

  const attachments = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('a[href*="download" i], a[href*="Attachment" i], a[href*=".pdf" i]'),
    )
      .slice(0, 20)
      .map((a) => (a as HTMLAnchorElement).href),
  );

  const primaryGrid = gridTables[0];
  const suggestedSelectors: PageSelectors = {
    grid: primaryGrid?.id && primaryGrid.id !== '(no id)' ? `#${primaryGrid.id}` : selectors.grid,
    pagingLabel: selectors.pagingLabel,
    viewAll: viewAllVisible ? selectors.viewAll : undefined,
    searchButton: searchControls.length > 0 ? selectors.searchButton : undefined,
    exportButton: exportButton ? selectors.exportButton : undefined,
    dismissModals: modals.length > 0 ? selectors.dismissModals : undefined,
  };

  const template = classifyTemplate(
    gridTables.length,
    pagingLabel,
    viewAllVisible,
    exportButton,
    formFields.length,
    config.tableType,
  );

  return {
    moduleKey: config.key,
    url,
    title: await page.title(),
    template,
    gridTables,
    pagingLabel,
    viewAllVisible,
    exportButton,
    searchControls,
    modals,
    detailLinks,
    formFields,
    attachments,
    suggestedSelectors,
    extractMode: templateToExtractMode(template, config.tableType),
    inspectedAt: new Date().toISOString(),
  };
}
