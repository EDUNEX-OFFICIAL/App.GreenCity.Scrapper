import { createLogger, type GenealogyJobPayload } from '@greencity/shared';
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
  runBpModules,
  saveFailureHtml,
  SessionManager,
} from '@greencity/scraper-core';
import { withBpPanel } from './session/panel.js';
import { scrapeBothGenealogyTrees } from './extractors/genealogy-tree.js';

const log = createLogger('genealogy-runner');

const moduleRegistry = createBpModuleRegistry(scrapeBothGenealogyTrees);

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
    await session.ensureDirs();
    await withBpPanel(
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

        await genealogyMetrics.time('db_upsert_ms', async () => {
          await upsertGenealogyResults({
            nodes: genealogy.nodes.map((node) => ({
              bpCode: node.bpCode,
              bpName: node.bpName ?? payload.bpName,
              uid: payload.uid,
              treeType: node.treeType,
              modalData: node.modalData,
              children: node.children,
              scrapeRunId: run.id,
            })),
            edges: genealogy.edges.map((edge) => ({ ...edge, scrapeRunId: run.id })),
          });
        }, { bpCode });
        nodesUpserted = genealogy.nodes.length;
        edgesUpserted = genealogy.edges.length;
      },
      { uid: payload.uid, bpName: payload.bpName, password: payload.password },
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
    await session.close();
  }
}
