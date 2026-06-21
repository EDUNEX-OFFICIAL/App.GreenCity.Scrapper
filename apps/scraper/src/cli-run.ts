import { runModuleJob } from './runner.js';
import { WAVE1_MODULES } from '@greencity/shared';
import { disconnectPrisma } from '@greencity/db';

const moduleKey = process.argv[2];

async function main() {
  const modules = moduleKey
    ? [{ key: moduleKey, portal: 'admin' as const }]
    : WAVE1_MODULES.map((m) => ({ key: m.key, portal: 'admin' as const }));

  for (const mod of modules) {
    console.log(`\n=== Scraping ${mod.key} ===`);
    try {
      await runModuleJob({ moduleKey: mod.key, portal: mod.portal });
      console.log(`✓ ${mod.key} done`);
    } catch (err) {
      console.error(`✗ ${mod.key} failed:`, err instanceof Error ? err.message : err);
    }
  }

  await disconnectPrisma();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
