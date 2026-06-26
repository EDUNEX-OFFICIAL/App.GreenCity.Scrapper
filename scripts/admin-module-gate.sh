#!/usr/bin/env bash
# Report failed row counts per admin module key.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T scraper node -e "
const { getPrisma } = await import('/app/packages/db/dist/client.js');
const rows = await getPrisma().rawModuleRow.groupBy({
  by: ['moduleKey'],
  where: { scrapeStatus: 'failed' },
  _count: true,
  orderBy: { _count: { moduleKey: 'desc' } },
});
const total = rows.reduce((s,r)=>s+r._count,0);
console.log('Total failed rows:', total);
for (const r of rows) console.log(r._count.toString().padStart(5), r.moduleKey);
process.exit(total > 0 ? 1 : 0);
"
