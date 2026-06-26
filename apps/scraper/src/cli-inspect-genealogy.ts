#!/usr/bin/env tsx
/**
 * Inspect genealogy + capture XHR/fetch/POST for reverse-engineering (Phase 9).
 * Usage: GENEALOGY_INSPECT_BP=RD11237858 pnpm exec tsx src/cli-inspect-genealogy.ts
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger, loadConfig } from '@greencity/shared';
import { NetworkCapture, suggestGenealogyHttpEndpoints } from '@greencity/scraper-core';
import { SessionManager } from './session/manager.js';
import { withBpPanel, gotoGenealogyTree } from './session/panel.js';
import { parseNodeModal, parseVisibleTreeNodes } from './extractors/genealogy-tree.js';

const log = createLogger('cli-inspect-genealogy');

async function main(): Promise<void> {
  loadConfig();
  const bpCode = process.env.GENEALOGY_INSPECT_BP ?? 'RD11237858';
  const password = process.env.GENEALOGY_INSPECT_PASSWORD;
  log.info({ bpCode }, 'Starting genealogy inspect + network capture');

  const capture = new NetworkCapture();
  const session = new SessionManager();
  const detachListeners: Array<() => void> = [];
  try {
    await withBpPanel(
      session,
      bpCode,
      async (bpPage) => {
        detachListeners.push(capture.attach(bpPage));
        log.info({ url: bpPage.url() }, 'BP panel URL');

        for (const treeType of ['sponsor', 'binary'] as const) {
          capture.setPhase(`${treeType}_genealogy`);
          await gotoGenealogyTree(bpPage, treeType);
          log.info({ treeType, url: bpPage.url() }, 'Tree page');
          const nodes = await parseVisibleTreeNodes(bpPage);
          log.info({ treeType, nodeCount: nodes.length }, 'Visible nodes');

          const root = nodes.find((n) => n.bpCode === bpCode) ?? nodes[0];
          if (root) {
            capture.setPhase(`${treeType}_modal`);
            await bpPage.locator(`text=(${root.bpCode})`).first().click({ timeout: 10000 }).catch(() => undefined);
            await bpPage
              .waitForSelector('.modal.show, .modal.in, [role="dialog"]', { timeout: 8000 })
              .catch(() => undefined);
            const modal = await parseNodeModal(bpPage);
            log.info({ treeType, modalKeys: Object.keys(modal.raw ?? {}) }, 'Node modal data');
          }
        }
      },
      { password, uid: process.env.GENEALOGY_INSPECT_UID },
    );

    const reportDir = process.env.NETWORK_CAPTURE_DIR ?? './.data/network-capture';
    await mkdir(reportDir, { recursive: true });
    const reportPath = await capture.saveReport(bpCode, reportDir);
    const jsonPath = join(reportDir, `${bpCode}-${Date.now()}.json`);
    await writeFile(jsonPath, JSON.stringify(capture.getCaptures(), null, 2), 'utf8');
    const suggestions = suggestGenealogyHttpEndpoints(capture.getCaptures());
    if (suggestions.length > 0) {
      log.info({ suggestions }, 'Suggested GENEALOGY_HTTP_TREE_URL candidates');
      console.log('\nSuggested HTTP endpoints (set GENEALOGY_HTTP_TREE_URL after verifying):\n');
      for (const s of suggestions) console.log(`  - ${s}`);
    } else {
      log.warn('No JSON tree endpoints detected — review network capture report manually');
    }

    log.info({ reportPath, jsonPath, captureCount: capture.getCaptures().length }, 'Network capture report saved');
  } finally {
    for (const detach of detachListeners) detach();
    await session.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
