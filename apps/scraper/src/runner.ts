import {
  getModuleConfig,
  type ModuleConfig,
  type ScrapeJobPayload,
  createLogger,
  jitteredDelay,
  loadConfig,
  adminUrl,
} from '@greencity/shared';
import {
  createScrapeRun,
  finishScrapeRun,
  upsertModuleRows,
  upsertFailedModuleRow,
  recordScrapeFailure,
  clearFailedPageRef,
} from '@greencity/db';
import { SessionManager, saveFailureHtml } from './session/manager.js';
import { runExtractor } from './extractors/grid.js';
import { runSequentialPortalJob } from './sequential-orchestrator.js';

const log = createLogger('runner');

export async function runModuleJob(payload: ScrapeJobPayload): Promise<void> {
  if (payload.moduleKey === 'portal_sequential') {
    await runSequentialPortalJob(payload);
    return;
  }

  await runAdminModuleJob(payload);
}

export async function runAdminModuleJob(payload: ScrapeJobPayload): Promise<void> {
  const config = getModuleConfig(payload.moduleKey);
  if (!config) {
    throw new Error(`Unknown admin module: ${payload.moduleKey}`);
  }

  const session = new SessionManager(undefined, payload.sessionSuffix);

  const run = payload.runId
    ? { id: payload.runId }
    : await createScrapeRun({
        moduleKey: payload.moduleKey,
        portal: 'admin',
        metadata: { dateFrom: payload.dateFrom, dateTo: payload.dateTo },
      });

  try {
    await session.ensureDirs();
    await runAdminModule(session, config, run.id, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ moduleKey: payload.moduleKey, err: message }, 'Module scrape failed');
    await upsertFailedModuleRow({
      moduleKey: payload.moduleKey,
      portal: 'admin',
      scrapeRunId: run.id,
      error: message,
    });
    await finishScrapeRun(run.id, {
      status: 'failed',
      rowCount: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      error: message,
    });
    throw err;
  } finally {
    await session.close();
  }
}

async function runAdminModule(
  session: SessionManager,
  config: ModuleConfig,
  runId: string,
  payload: ScrapeJobPayload,
): Promise<void> {
  const cfg = loadConfig();
  const prisma = (await import('@greencity/db')).getPrisma();
  await prisma.scrapeRun.update({ where: { id: runId }, data: { status: 'running', startedAt: new Date() } });

  const testMaxPagesRaw = process.env.SCRAPER_TEST_MAX_PAGES ?? process.env.BP_LIST_TEST_MAX_PAGES;
  const testMaxPages = testMaxPagesRaw ? Number.parseInt(testMaxPagesRaw, 10) : undefined;
  const effectiveConfig =
    testMaxPages && Number.isFinite(testMaxPages)
      ? { ...config, maxPages: testMaxPages }
      : config;

  const streamPages =
    (effectiveConfig.tableType === 'paginated-grid' || Boolean(effectiveConfig.upsertPerPage)) &&
    !effectiveConfig.dropdownIterate &&
    effectiveConfig.extractMode !== 'form';

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalRows = 0;
  let lastPage = 0;

  await session.withAdminPage(
    async (page) => {
    if (!effectiveConfig.directUrl) {
      await session.navigateSidebar(page, effectiveConfig.navPath);
    }
    await jitteredDelay(cfg.scraperDelayMs);

    const extractOptions = {
      pageStart: payload.pageStart,
      pageEnd: payload.pageEnd,
      onPage: streamPages
        ? async (rows: Record<string, string>[], pageNum: number) => {
            if (rows.length === 0) return;
            const upsert = await upsertModuleRows({
              moduleKey: effectiveConfig.key,
              portal: 'admin',
              scrapeRunId: runId,
              rows,
            });
            totalInserted += upsert.inserted;
            totalUpdated += upsert.updated;
            totalRows += rows.length;
            lastPage = pageNum;
            await clearFailedPageRef(effectiveConfig.key, pageNum);
            await prisma.scrapeRun.update({
              where: { id: runId },
              data: {
                rowCount: totalRows,
                rowsInserted: totalInserted,
                rowsUpdated: totalUpdated,
                metadata: {
                  lastPage,
                  rowsSoFar: totalRows,
                  pagesScraped: pageNum,
                  pageStart: payload.pageStart,
                  pageEnd: payload.pageEnd,
                  dateFrom: payload.dateFrom,
                  dateTo: payload.dateTo,
                },
              },
            });
          }
        : undefined,
      onPageFailed: async (pageNum: number, error: string) => {
        await upsertFailedModuleRow({
          moduleKey: effectiveConfig.key,
          portal: 'admin',
          scrapeRunId: runId,
          pageNum,
          error,
        });
      },
      onDetailFailed: async (identifiers: Record<string, string>, error: string) => {
        await upsertFailedModuleRow({
          moduleKey: effectiveConfig.key,
          portal: 'admin',
          scrapeRunId: runId,
          identifiers,
          error,
        });
      },
    };

    const result = await runExtractor(page, effectiveConfig, session, extractOptions);

    if (result.columnWarnings.length > 0) {
      const htmlPath = await saveFailureHtml(runId, await page.content());
      await recordScrapeFailure({
        scrapeRunId: runId,
        moduleKey: effectiveConfig.key,
        url: page.url(),
        error: result.columnWarnings.join('; '),
        htmlPath,
      });
    }

    const isGarbage = result.columnWarnings.some((w) => w.toLowerCase().includes('garbage'));

    if (!streamPages) {
      const normalized = isGarbage ? [] : result.rows.map((r) => r.data);
      const upsert =
        normalized.length > 0
          ? await upsertModuleRows({
              moduleKey: effectiveConfig.key,
              portal: 'admin',
              scrapeRunId: runId,
              rows: normalized,
            })
          : { inserted: 0, updated: 0, total: 0 };
      totalInserted = upsert.inserted;
      totalUpdated = upsert.updated;
      totalRows = normalized.length;
    }

    await finishScrapeRun(runId, {
      status: isGarbage || result.columnWarnings.length > 0 ? 'partial' : 'completed',
      rowCount: totalRows,
      rowsInserted: totalInserted,
      rowsUpdated: totalUpdated,
      metadata: {
        pagesScraped: result.pagesScraped,
        lastPage: streamPages ? lastPage : undefined,
        rowsSoFar: streamPages ? totalRows : undefined,
        pageStart: payload.pageStart,
        pageEnd: payload.pageEnd,
        usedExport: result.usedExport,
        columnWarnings: result.columnWarnings,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateTo,
      },
    });

    log.info(
      { moduleKey: effectiveConfig.key, rows: totalRows, inserted: totalInserted, updated: totalUpdated },
      'Admin module scrape completed',
    );
  },
    effectiveConfig.directUrl ? { directUrl: effectiveConfig.directUrl } : undefined,
  );
}
