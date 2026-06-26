import { loadConfig } from '@greencity/shared';
import { findBpListRow } from '@greencity/scraper-core';
import { SessionManager } from './session/manager.js';
import { searchBpOnAdminList } from './session/panel.js';

const bpCode = process.argv[2] ?? 'D119380';
const uid = process.argv[3];

async function main() {
  loadConfig();
  const session = new SessionManager();
  await session.withAdminPage(async (page) => {
    const ok = await searchBpOnAdminList(page, bpCode, session, uid ? [uid] : []);
    const row = await findBpListRow(page, bpCode);
    const gridRows = await page.locator('table[id*="GridView"] tr').filter({ has: page.locator('td') }).count();
    console.log(JSON.stringify({ bpCode, uid: uid ?? null, ok, hasRow: !!row, gridRows, url: page.url() }));
  });
  await session.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
