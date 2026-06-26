import {
  countFailedRows,
  countScrapeFailuresForRun,
  createScrapeRun,
  getFailedPageRefs,
} from '@greencity/db';
import { createLogger } from '@greencity/shared';
import { runAdminModuleJob } from './runner.js';

const log = createLogger('module-retry');

const MAX_RETRY_ROUNDS = Number.parseInt(process.env.MODULE_GATE_MAX_RETRIES ?? '5', 10);

export interface ModuleGateResult {
  passed: boolean;
  failedRows: number;
  runFailures: number;
  failedPages: number[];
}

export async function checkModuleGate(moduleKey: string, childRunId: string): Promise<ModuleGateResult> {
  const [failedRows, runFailures, failedPages] = await Promise.all([
    countFailedRows(moduleKey),
    countScrapeFailuresForRun(childRunId),
    getFailedPageRefs(moduleKey),
  ]);
  return {
    passed: failedRows === 0 && runFailures === 0,
    failedRows,
    runFailures,
    failedPages,
  };
}

export async function retryFailedPagesForModule(
  moduleKey: string,
  parentRunId: string,
  pageNums?: number[],
): Promise<number> {
  const pages = pageNums ?? (await getFailedPageRefs(moduleKey));
  let retried = 0;
  for (const pageNum of pages) {
    const childRun = await createScrapeRun({
      moduleKey,
      portal: 'admin',
      metadata: { parentRunId, pageRetry: pageNum },
    });
    try {
      await runAdminModuleJob({
        moduleKey,
        portal: 'admin',
        runId: childRun.id,
        pageStart: pageNum,
        pageEnd: pageNum,
      });
    } catch (err) {
      log.warn(
        { moduleKey, pageNum, err: err instanceof Error ? err.message : String(err) },
        'Failed page retry threw',
      );
    }
    retried++;
  }
  return retried;
}

/** Run module scrape with gate + failed-page retries until clean or max rounds. */
export async function runAdminModuleWithGate(moduleKey: string, parentRunId: string): Promise<boolean> {
  for (let round = 0; round <= MAX_RETRY_ROUNDS; round++) {
    const childRun = await createScrapeRun({
      moduleKey,
      portal: 'admin',
      metadata: { parentRunId, gateRound: round },
    });

    let jobThrew = false;
    try {
      await runAdminModuleJob({ moduleKey, portal: 'admin', runId: childRun.id });
    } catch (err) {
      jobThrew = true;
      log.warn(
        { moduleKey, round, err: err instanceof Error ? err.message : String(err) },
        'Module scrape threw',
      );
    }

    let gate = await checkModuleGate(moduleKey, childRun.id);
    if (gate.passed && !jobThrew) {
      log.info({ moduleKey, round }, 'Module gate passed');
      return true;
    }

    if (gate.failedPages.length > 0 && round < MAX_RETRY_ROUNDS) {
      log.info({ moduleKey, pages: gate.failedPages, round }, 'Retrying failed pages');
      await retryFailedPagesForModule(moduleKey, parentRunId, gate.failedPages);
      gate = await checkModuleGate(moduleKey, childRun.id);
      if (gate.passed) {
        log.info({ moduleKey, round }, 'Module gate passed after page retries');
        return true;
      }
    }

    if (round >= MAX_RETRY_ROUNDS) {
      log.warn(
        { moduleKey, failedRows: gate.failedRows, runFailures: gate.runFailures, failedPages: gate.failedPages },
        'Module gate failed after max retries',
      );
      return false;
    }
  }
  return false;
}
