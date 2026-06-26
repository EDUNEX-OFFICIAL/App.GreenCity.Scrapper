import { createLogger, getModuleConfig } from '@greencity/shared';
import { createScrapeRun } from '@greencity/db';
import { runAdminModuleJob } from './runner.js';
import { SessionManager } from './session/manager.js';

const log = createLogger('bp-list-remaining');

export const BP_LIST_REMAINING_CHUNKS = [
  { pageStart: 935, pageEnd: 1769, label: 'resume' },
] as const;

export async function runBpListRemainingChunks(): Promise<boolean> {
  log.info('Starting BP list remaining chunks (B + C)');

  const mod = getModuleConfig('bp_list');
  if (mod) {
    const warmup = new SessionManager();
    try {
      await warmup.withAdminPage(async () => undefined, {
        directUrl: mod.directUrl ?? '/membermanagement/AdminMemberList.aspx',
      });
      log.info('BP list session warmed up before remaining chunks');
    } finally {
      await warmup.close();
    }
  }

  const results: boolean[] = [];
  for (const chunk of BP_LIST_REMAINING_CHUNKS) {
    const childRun = await createScrapeRun({
      moduleKey: 'bp_list',
      portal: 'admin',
      metadata: {
        chunk: chunk.label,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        triggeredBy: 'bp_list_remaining',
      },
    });

    try {
      await runAdminModuleJob({
        moduleKey: 'bp_list',
        portal: 'admin',
        runId: childRun.id,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
      });
      log.info({ chunk: chunk.label, pages: `${chunk.pageStart}-${chunk.pageEnd}` }, 'Chunk completed');
      results.push(true);
    } catch (err) {
      log.error(
        { chunk: chunk.label, err: err instanceof Error ? err.message : String(err) },
        'Chunk failed',
      );
      results.push(false);
    }
  }

  const allOk = results.every(Boolean);
  if (allOk) {
    log.info('All remaining BP list chunks done — genealogy NOT auto-started (trigger manually when ready)');
  } else {
    log.warn('Some BP list chunks failed — fix and resume BP list before genealogy');
  }

  return allOk;
}
