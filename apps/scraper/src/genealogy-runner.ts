import { createLogger, loadConfig, type GenealogyJobPayload, type GenealogyScrapeResult } from '@greencity/shared';
import {
  createScrapeRun,
  finishScrapeRun,
  incrementGenealogyBatchProgress,
  recordScrapeFailure,
  setGenealogyBatchCurrentBp,
  upsertFailedGenealogyNode,
  upsertFailedModuleRow,
  upsertGenealogyResults,
} from '@greencity/db';
import {
  createBpModuleRegistry,
  fetchBothGenealogyViaHttp,
  genealogyMetrics,
  isAdminPanelHttpHybridEnabled,
  isConfirmedBlankGenealogy,
  isHttpGenealogyOnly,
  shouldUseHttpGenealogyHarvest,
  runBpModules,
  saveFailureHtml,
  SessionManager,
  withPortalRetry,
} from '@greencity/scraper-core';
import { access } from 'node:fs/promises';
import { withBpPanel, bpStoragePath } from './session/panel.js';
import { scrapeBothGenealogyTrees } from './extractors/genealogy-tree.js';

const log = createLogger('genealogy-runner');

const moduleRegistry = createBpModuleRegistry(scrapeBothGenealogyTrees);

async function tryHybridHttpFromCachedSession(bpCode: string): Promise<GenealogyScrapeResult | null> {
  const cfg = loadConfig();
  const path = bpStoragePath(cfg, bpCode);
  try {
    await access(path);
  } catch {
    return null;
  }
  return fetchBothGenealogyViaHttp(bpCode, {});
}

async function persistGenealogyResult(
  runId: string,
  batchRunId: string | undefined,
  bpCode: string,
  payload: { bpName?: string; uid?: string },
  genealogy: GenealogyScrapeResult,
  source: 'http' | 'playwright',
): Promise<{ nodesUpserted: number; edgesUpserted: number }> {
  if (!payload.uid) {
    throw new Error(`Genealogy persist requires uid for BP ${bpCode}`);
  }
  const uid = payload.uid;
  let nodesUpserted = 0;
  let edgesUpserted = 0;

  await genealogyMetrics.time('db_upsert_ms', async () => {
    await upsertGenealogyResults({
      nodes: genealogy.nodes.map((node) => ({
        bpCode: node.bpCode,
        bpName: node.bpName ?? payload.bpName,
        uid,
        treeType: node.treeType,
        modalData: node.modalData,
        children: node.children,
        scrapeRunId: runId,
      })),
      edges: genealogy.edges.map((edge) => ({ ...edge, scrapeRunId: runId })),
    });
  }, { bpCode, source });
  nodesUpserted = genealogy.nodes.length;
  edgesUpserted = genealogy.edges.length;

  if (isConfirmedBlankGenealogy(genealogy)) {
    log.info({ bpCode, uid, source }, 'Genealogy snapshot empty on portal — treating as valid blank BP');
  } else {
    const prisma = (await import('@greencity/db')).getPrisma();
    const stored = await prisma.genealogyNode.findMany({
      where: { uid },
      select: { treeType: true },
    });
    const trees = new Set(stored.map((n) => n.treeType));
    if (!trees.has('sponsor') || !trees.has('binary')) {
      throw new Error(
        `Genealogy incomplete for ${bpCode} after persist (have: ${[...trees].join(',') || 'none'})`,
      );
    }
  }

  return { nodesUpserted, edgesUpserted };
}

async function runGenealogyBpJobViaHttp(
  runId: string,
  batchRunId: string | undefined,
  payload: GenealogyJobPayload,
): Promise<{ nodesUpserted: number; edgesUpserted: number }> {
  const bpCode = payload.bpCode!;
  if (batchRunId) await setGenealogyBatchCurrentBp(batchRunId, bpCode);

  const genealogy = await genealogyMetrics.time(
    'http_harvest_ms',
    () => fetchBothGenealogyViaHttp(bpCode, { password: payload.password }),
    { bpCode },
  );

  if (!genealogy) {
    throw new Error(
      'HTTP genealogy harvest failed — set GENEALOGY_HTTP_TREE_URL and GENEALOGY_HTTP_COOKIE (or per-BP session cookies)',
    );
  }

  return persistGenealogyResult(runId, batchRunId, bpCode, payload, genealogy, 'http');
}

export async function runGenealogyBpJob(payload: GenealogyJobPayload): Promise<void> {
  const bpCode = payload.bpCode;
  if (!bpCode) throw new Error('genealogy_bp requires bpCode');

  const run = payload.runId
    ? { id: payload.runId }
    : await createScrapeRun({
        moduleKey: 'genealogy_bp',
        portal: 'bp',
        bpCode,
        metadata: { parentRunId: payload.parentRunId },
      });

  const prisma = (await import('@greencity/db')).getPrisma();
  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: { status: 'running', startedAt: new Date() },
  });

  const session = new SessionManager();
  let nodesUpserted = 0;
  let edgesUpserted = 0;
  const batchRunId = payload.parentRunId;

  if (batchRunId) {
    await setGenealogyBatchCurrentBp(batchRunId, bpCode);
  }

  try {
    if (isHttpGenealogyOnly() && shouldUseHttpGenealogyHarvest()) {
      const { nodesUpserted, edgesUpserted } = await runGenealogyBpJobViaHttp(run.id, batchRunId, payload);
      await finishScrapeRun(run.id, {
        status: 'completed',
        rowCount: nodesUpserted,
        rowsInserted: nodesUpserted,
        rowsUpdated: 0,
        metadata: { bpCode, nodesUpserted, edgesUpserted, trees: ['sponsor', 'binary'], source: 'http' },
      });
      if (batchRunId) await incrementGenealogyBatchProgress(batchRunId, { completed: 1 });
      log.info({ bpCode, nodesUpserted, edgesUpserted, source: 'http' }, 'Genealogy BP scrape completed');
      return;
    }

    if (shouldUseHttpGenealogyHarvest()) {
      try {
        const { nodesUpserted, edgesUpserted } = await runGenealogyBpJobViaHttp(run.id, batchRunId, payload);
        await finishScrapeRun(run.id, {
          status: 'completed',
          rowCount: nodesUpserted,
          rowsInserted: nodesUpserted,
          rowsUpdated: 0,
          metadata: { bpCode, nodesUpserted, edgesUpserted, trees: ['sponsor', 'binary'], source: 'http' },
        });
        if (batchRunId) await incrementGenealogyBatchProgress(batchRunId, { completed: 1 });
        log.info({ bpCode, nodesUpserted, edgesUpserted, source: 'http' }, 'Genealogy BP scrape completed');
        return;
      } catch (httpErr) {
        log.warn(
          { bpCode, err: httpErr instanceof Error ? httpErr.message : String(httpErr) },
          'HTTP harvest failed — falling back to Playwright',
        );
      }
    }

    if (isAdminPanelHttpHybridEnabled()) {
      await session.ensureDirs();

      let genealogy = await genealogyMetrics.time(
        'http_harvest_ms',
        () => tryHybridHttpFromCachedSession(bpCode),
        { bpCode, source: 'cached_session' },
      );

      if (!genealogy) {
        await withPortalRetry(
          () =>
            withBpPanel(
              session,
              bpCode,
              async (bpPage) => {
                if (!/\/_bp\//i.test(bpPage.url())) {
                  throw new Error(`BP panel not open for ${bpCode}`);
                }
              },
              { uid: payload.uid, bpName: payload.bpName },
            ),
          `genealogy_panel:${bpCode}`,
        );

        genealogy = await genealogyMetrics.time(
          'http_harvest_ms',
          () => fetchBothGenealogyViaHttp(bpCode, {}),
          { bpCode },
        );
      }

      if (!genealogy) {
        log.warn({ bpCode }, 'HTTP harvest failed after admin panel — falling back to Playwright trees');
      } else {
        const counts = await persistGenealogyResult(
          run.id,
          batchRunId,
          bpCode,
          { bpName: payload.bpName, uid: payload.uid },
          genealogy,
          'http',
        );
        nodesUpserted = counts.nodesUpserted;
        edgesUpserted = counts.edgesUpserted;

        await finishScrapeRun(run.id, {
          status: 'completed',
          rowCount: nodesUpserted,
          rowsInserted: nodesUpserted,
          rowsUpdated: 0,
          metadata: { bpCode, nodesUpserted, edgesUpserted, trees: ['sponsor', 'binary'], source: 'admin_panel_http' },
        });
        if (batchRunId) await incrementGenealogyBatchProgress(batchRunId, { completed: 1 });
        log.info({ bpCode, nodesUpserted, edgesUpserted, source: 'admin_panel_http' }, 'Genealogy BP scrape completed');
        return;
      }
    }

    await session.ensureDirs();
    await withPortalRetry(
      () =>
        withBpPanel(
          session,
          bpCode,
          async (bpPage) => {
            const [result] = await genealogyMetrics.time('navigation_ms', () =>
              runBpModules(
                bpPage,
                { bpCode, bpName: payload.bpName, uid: payload.uid, scrapeRunId: run.id },
                ['genealogy'],
                moduleRegistry,
              ),
            { bpCode });

            const genealogy = result.genealogy;
            if (!genealogy) throw new Error('Genealogy module returned no data');

            const counts = await persistGenealogyResult(
              run.id,
              batchRunId,
              bpCode,
              { bpName: payload.bpName, uid: payload.uid },
              genealogy,
              'playwright',
            );
            nodesUpserted = counts.nodesUpserted;
            edgesUpserted = counts.edgesUpserted;
          },
          { uid: payload.uid, bpName: payload.bpName, password: payload.password },
        ),
      `genealogy_bp:${bpCode}`,
    );

    await finishScrapeRun(run.id, {
      status: 'completed',
      rowCount: nodesUpserted,
      rowsInserted: nodesUpserted,
      rowsUpdated: 0,
      metadata: { bpCode, nodesUpserted, edgesUpserted, trees: ['sponsor', 'binary'] },
    });

    if (batchRunId) {
      await incrementGenealogyBatchProgress(batchRunId, { completed: 1 });
    }

    log.info({ bpCode, nodesUpserted, edgesUpserted }, 'Genealogy BP scrape completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ bpCode, err: message }, 'Genealogy BP scrape failed');
    const htmlPath = await saveFailureHtml(run.id, `<pre>${message}</pre>`);
    await recordScrapeFailure({
      scrapeRunId: run.id,
      moduleKey: 'genealogy_bp',
      error: message,
      htmlPath,
    });
    await upsertFailedGenealogyNode({
      bpCode,
      uid: payload.uid ?? `legacy-${bpCode}`,
      bpName: payload.bpName,
      scrapeRunId: run.id,
      error: message,
    });
    await upsertFailedModuleRow({
      moduleKey: 'bp_list',
      portal: 'admin',
      scrapeRunId: run.id,
      identifiers: {
        'BP ID': bpCode,
        UID: payload.uid ?? '',
        Name: payload.bpName ?? '',
      },
      error: message,
    });
    await finishScrapeRun(run.id, {
      status: 'failed',
      rowCount: nodesUpserted,
      rowsInserted: 0,
      rowsUpdated: 0,
      error: message,
    });
    if (batchRunId) {
      await incrementGenealogyBatchProgress(batchRunId, { failed: 1 });
    }
    throw err;
  } finally {
    if (!isHttpGenealogyOnly()) {
      await session.close();
    }
  }
}
