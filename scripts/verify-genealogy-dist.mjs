#!/usr/bin/env node
/**
 * Fail build if critical genealogy exports are missing from compiled dist.
 * Run after `pnpm bootstrap` to guard against src/dist regression.
 */
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const checks = [
  {
    file: 'packages/db/dist/genealogy.js',
    mustInclude: [
      'getBpListEntriesForGenealogy',
      'getCompletedBpCodes',
      'incrementGenealogyBatchProgress',
    ],
  },
  {
    file: 'packages/queue/dist/genealogy-queue.js',
    mustInclude: ['enqueueGenealogyBpJobs', 'obliterateGenealogyQueue'],
  },
  {
    file: 'apps/scraper/dist/genealogy-orchestrator.js',
    mustInclude: ['enqueueGenealogyBpJobs', 'getBpListEntriesForGenealogy'],
  },
  {
    file: 'apps/scraper/dist/extractors/genealogy-tree.js',
    mustInclude: ['parseDirectChildren', 'Tree snapshot scraped'],
  },
  {
    file: 'apps/scraper/dist/genealogy-runner.js',
    mustInclude: ['incrementGenealogyBatchProgress'],
  },
];

let failed = false;
for (const { file, mustInclude } of checks) {
  const path = join(root, file);
  try {
    await access(path);
    const content = await readFile(path, 'utf8');
    for (const needle of mustInclude) {
      if (!content.includes(needle)) {
        console.error(`FAIL ${file}: missing "${needle}"`);
        failed = true;
      }
    }
  } catch {
    console.error(`FAIL ${file}: file not found — run pnpm bootstrap first`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log('OK: critical genealogy dist exports verified');
