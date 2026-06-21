#!/usr/bin/env tsx
/**
 * HTTP harvest prototype benchmark (Phase 10) — compares Playwright vs HTTP when endpoints configured.
 * Requires: GENEALOGY_HTTP_TREE_URL, GENEALOGY_HTTP_COOKIE, GENEALOGY_INSPECT_BP
 */
import { createLogger, loadConfig } from '@greencity/shared';
import { compareHarvestResults, fetchGenealogyViaHttp } from '@greencity/scraper-core';
import { SessionManager } from './session/manager.js';
import { withBpPanel } from './session/panel.js';
import { scrapeBothGenealogyTrees } from './extractors/genealogy-tree.js';

const log = createLogger('cli-http-harvest');

async function main(): Promise<void> {
  loadConfig();
  const bpCode = process.env.GENEALOGY_INSPECT_BP ?? process.env.GENEALOGY_HTTP_BP;
  if (!bpCode) {
    console.error('Set GENEALOGY_INSPECT_BP or GENEALOGY_HTTP_BP');
    process.exit(1);
  }

  const session = new SessionManager();
  const pwStart = Date.now();
  let pwResult;
  try {
    pwResult = await withBpPanel(session, bpCode, (page) => scrapeBothGenealogyTrees(page, bpCode), {
      password: process.env.GENEALOGY_INSPECT_PASSWORD,
    });
  } finally {
    await session.close();
  }
  const pwMs = Date.now() - pwStart;

  const httpStart = Date.now();
  const sponsorHttp = await fetchGenealogyViaHttp(bpCode, 'sponsor', {});
  const binaryHttp = await fetchGenealogyViaHttp(bpCode, 'binary', {});
  const httpMs = Date.now() - httpStart;

  if (!sponsorHttp || !binaryHttp) {
    log.warn('HTTP endpoints not configured — set GENEALOGY_HTTP_TREE_URL and GENEALOGY_HTTP_COOKIE');
    log.info({ bpCode, pwMs, pwNodes: pwResult.nodes.length }, 'Playwright-only benchmark');
    return;
  }

  const httpCombined = { nodes: [...sponsorHttp.nodes, ...binaryHttp.nodes], edges: [...sponsorHttp.edges, ...binaryHttp.edges] };
  const comparison = compareHarvestResults(pwResult, httpCombined);

  log.info(
    {
      bpCode,
      pwMs,
      httpMs,
      speedup: pwMs / Math.max(1, httpMs),
      match: comparison.match,
      differences: comparison.differences,
      pwBpPerMin: 60_000 / pwMs,
      httpBpPerMin: 60_000 / httpMs,
    },
    'HTTP harvest prototype benchmark',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
