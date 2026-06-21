import { SessionManager } from './session/manager.js';
import { parseHtmlTable } from '@greencity/shared';
import { writeFile } from 'node:fs/promises';
import { adminUrl } from '@greencity/shared';

async function main() {
  const session = new SessionManager();
  await session.withAdminPage(async (page) => {
    const url = adminUrl(process.env.ERP_BASE_URL ?? 'http://app.greencity.org.in', '/Master/Bank.aspx');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    const html = await page.content();
    await writeFile('/data/debug-bank-direct.html', html);
    const { headers, rows } = parseHtmlTable(html);
    console.log('URL:', page.url());
    console.log('Headers:', headers);
    console.log('Row count:', rows.length);
    console.log('First row:', rows[0]);
  });
  await session.close();
}

main().catch(console.error);
