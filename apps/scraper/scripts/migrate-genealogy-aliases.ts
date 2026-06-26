#!/usr/bin/env tsx
/**
 * One-off: rename genealogy nodes stored under portal alias codes to bp_list BP IDs.
 * Usage: pnpm --filter @greencity/scraper migrate:genealogy-aliases
 */
import { disconnectPrisma, migrateGenealogyBpAliases } from '@greencity/db';

async function main() {
  const result = await migrateGenealogyBpAliases();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  await disconnectPrisma();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
