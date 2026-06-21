import { getSequentialAdminModules, createLogger, type ScrapeJobPayload } from '@greencity/shared';
import { createScrapeRun, finishScrapeRun } from '@greencity/db';
import { runAdminModuleJob } from './runner.js';
import { SessionManager } from './session/manager.js';

const log = createLogger('sequential');

const BP_LIST_CHUNKS = [
  { pageStart: 1, pageEnd: 600, label: 'A' },
  { pageStart: 601, pageEnd: 1200, label: 'B' },
  { pageStart: 1201, pageEnd: 1769, label: 'C' },
] as const;

export async function runSequentialPortalJob(payload: ScrapeJobPayload): Promise<void> {
  const parentRunId = payload.runId;
  if (!parentRunId) throw new Error('portal_sequential requires runId');

  const skipSet = new Set(payload.skipModuleKeys ?? []);
  const modules = getSequentialAdminModules().filter((m) => !skipSet.has(m.key));
  const prisma = (await import('@greencity/db')).getPrisma();

  await prisma.scrapeRun.update({
    where: { id: parentRunId },
    data: { status: 'running', startedAt: new Date() },
  });

  const completedModules: string[] = [];
  const failedModules: string[] = [];

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];

    await prisma.scrapeRun.update({
      where: { id: parentRunId },
      data: {
        metadata: {
          moduleIndex: i + 1,
          totalModules: modules.length,
          currentModule: mod.key,
          currentLabel: mod.label,
          navPath: mod.navPath,
          completedModules: [...completedModules],
          failedModules: [...failedModules],
        },
      },
    });

    log.info(
      { moduleKey: mod.key, index: i + 1, total: modules.length, navPath: mod.navPath.join(' > ') },
      'Starting sequential module',
    );

    if (mod.key === 'bp_list') {
      const warmup = new SessionManager();
      try {
        await warmup.withAdminPage(async () => undefined, {
          directUrl: mod.directUrl ?? '/membermanagement/AdminMemberList.aspx',
        });
        log.info('BP list session warmed up for parallel chunks');
      } finally {
        await warmup.close();
      }

      const chunkResults: boolean[] = [];
      for (const chunk of BP_LIST_CHUNKS) {
        const childRun = await createScrapeRun({
          moduleKey: mod.key,
          portal: 'admin',
          metadata: {
            parentRunId,
            navPath: mod.navPath,
            chunk: chunk.label,
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
          },
        });

        try {
          await runAdminModuleJob({
            moduleKey: mod.key,
            portal: 'admin',
            runId: childRun.id,
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
          });
          log.info({ chunk: chunk.label, pages: `${chunk.pageStart}-${chunk.pageEnd}` }, 'BP list chunk completed');
          chunkResults.push(true);
        } catch (err) {
          log.warn(
            { chunk: chunk.label, err: err instanceof Error ? err.message : String(err) },
            'BP list chunk failed',
          );
          chunkResults.push(false);
        }
      }

      if (chunkResults.every(Boolean)) {
        completedModules.push(mod.key);
      } else {
        failedModules.push(mod.key);
      }

      try {
        const { enqueueGenealogyBatchIfEnabled } = await import('./genealogy-orchestrator.js');
        if (chunkResults.every(Boolean)) {
          await enqueueGenealogyBatchIfEnabled(parentRunId);
        } else {
          log.warn('bp_list had failed chunks — genealogy batch skipped (run trigger-bp-list-remaining or trigger-genealogy manually)');
        }
      } catch (err) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Failed to enqueue genealogy batch after bp_list',
        );
      }
      continue;
    }

    const childRun = await createScrapeRun({
      moduleKey: mod.key,
      portal: 'admin',
      metadata: { parentRunId, navPath: mod.navPath },
    });

    try {
      await runAdminModuleJob({ moduleKey: mod.key, portal: 'admin', runId: childRun.id });
      completedModules.push(mod.key);
    } catch (err) {
      failedModules.push(mod.key);
      log.warn(
        { moduleKey: mod.key, err: err instanceof Error ? err.message : String(err) },
        'Module failed in sequential run, continuing',
      );
    }
  }

  await finishScrapeRun(parentRunId, {
    status: failedModules.length > 0 ? 'partial' : 'completed',
    rowCount: completedModules.length,
    rowsInserted: completedModules.length,
    rowsUpdated: 0,
    metadata: {
      totalModules: modules.length,
      completedModules,
      failedModules,
      moduleIndex: modules.length,
      currentModule: null,
      currentLabel: null,
    },
  });

  log.info(
    { completed: completedModules.length, failed: failedModules.length, total: modules.length },
    'Sequential portal scrape finished',
  );
}
