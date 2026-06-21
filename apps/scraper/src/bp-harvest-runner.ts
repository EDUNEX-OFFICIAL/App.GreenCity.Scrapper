import { createLogger, type BpHarvestJobPayload, type BpHarvestModuleName } from '@greencity/shared';
import {
  createScrapeRun,
  finishScrapeRun,
  incrementGenealogyBatchProgress,
  recordScrapeFailure,
  setGenealogyBatchCurrentBp,
  upsertGenealogyResults,
} from '@greencity/db';
import {
  createBpModuleRegistry,
  genealogyMetrics,
  isConfirmedBlankGenealogy,
  runBpModules,
  saveFailureHtml,
  SessionManager,
  withPortalRetry,
} from '@greencity/scraper-core';
import { withBpPanel } from './session/panel.js';
import { scrapeBothGenealogyTrees } from './extractors/genealogy-tree.js';

const log = createLogger('bp-harvest-runner');

const moduleRegistry = createBpModuleRegistry(scrapeBothGenealogyTrees);

export async function runBpHarvestJob(payload: BpHarvestJobPayload): Promise<void> {
  const bpCode = payload.bpCode;
  const modules = normalizeModules(payload.modules);

  const run = payload.runId
    ? { id: payload.runId }
    : await createScrapeRun({
        moduleKey: 'bp_harvest',
        portal: 'bp',
        bpCode,
        metadata: { parentRunId: payload.parentRunId, modules },
      });

  const prisma = (await import('@greencity/db')).getPrisma();
  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: { status: 'running', startedAt: new Date() },
  });

  const session = new SessionManager();
  const batchRunId = payload.parentRunId;
  let rowCount = 0;

  if (batchRunId) {
    await setGenealogyBatchCurrentBp(batchRunId, bpCode);
  }

  try {
    await session.ensureDirs();
    await withPortalRetry(
      () =>
        withBpPanel(
          session,
          bpCode,
          async (bpPage) => {
            const results = await genealogyMetrics.time(
              'harvest_ms',
              () =>
                runBpModules(
                  bpPage,
                  { bpCode, bpName: payload.bpName, uid: payload.uid, scrapeRunId: run.id },
                  modules,
                  moduleRegistry,
                ),
              { bpCode, modules: modules.join(',') },
            );

            for (const result of results) {
              if (result.genealogy) {
                if (isConfirmedBlankGenealogy(result.genealogy)) {
                  log.info({ bpCode }, 'Genealogy snapshot empty on portal — treating as valid blank BP');
                }
                await genealogyMetrics.time('db_upsert_ms', async () => {
                  await upsertGenealogyResults({
                    nodes: result.genealogy!.nodes.map((node) => ({
                      bpCode: node.bpCode,
                      bpName: node.bpName ?? payload.bpName,
                      uid: payload.uid,
                      treeType: node.treeType,
                      modalData: node.modalData,
                      children: node.children,
                      scrapeRunId: run.id,
                    })),
                    edges: result.genealogy!.edges.map((edge) => ({ ...edge, scrapeRunId: run.id })),
                  });
                }, { bpCode });
              }
              rowCount += result.rowCount;
            }
          },
          { uid: payload.uid, bpName: payload.bpName, password: payload.password },
        ),
      `bp_harvest:${bpCode}`,
    );

    await finishScrapeRun(run.id, {
      status: 'completed',
      rowCount,
      rowsInserted: rowCount,
      rowsUpdated: 0,
      metadata: { bpCode, modules, rowCount },
    });

    if (batchRunId) {
      await incrementGenealogyBatchProgress(batchRunId, { completed: 1 });
    }

    log.info({ bpCode, modules, rowCount }, 'BP harvest completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ bpCode, err: message }, 'BP harvest failed');
    const htmlPath = await saveFailureHtml(run.id, `<pre>${message}</pre>`);
    await recordScrapeFailure({
      scrapeRunId: run.id,
      moduleKey: 'bp_harvest',
      error: message,
      htmlPath,
    });
    await finishScrapeRun(run.id, {
      status: 'failed',
      rowCount,
      rowsInserted: 0,
      rowsUpdated: 0,
      error: message,
    });
    if (batchRunId) {
      await incrementGenealogyBatchProgress(batchRunId, { failed: 1 });
    }
    throw err;
  } finally {
    await session.close();
  }
}

function normalizeModules(modules: BpHarvestModuleName[]): BpHarvestModuleName[] {
  if (modules.length > 0) return modules;
  return ['genealogy'];
}
