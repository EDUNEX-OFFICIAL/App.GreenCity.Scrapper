import { SessionManager } from './session/manager.js';
import { getModuleConfig } from '@greencity/shared';
import { writeFile } from 'node:fs/promises';

const moduleKey = process.argv[2] ?? 'master_bank';

async function main() {
  const config = getModuleConfig(moduleKey)!;
  const session = new SessionManager();

  await session.withAdminPage(async (page) => {
    console.log('After login URL:', page.url());
    await writeFile('/data/debug-after-login.html', await page.content());

    // Try direct URL patterns common in ASP.NET admin ERPs
    const base = 'http://app.greencity.org.in/_admin';
    const guesses = [
      `${base}/Master/Bank.aspx`,
      `${base}/master/Bank.aspx`,
      `${base}/MasterBank.aspx`,
      `${base}/Home.aspx`,
    ];

    for (const url of guesses) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      console.log('Tried:', url, '->', page.url());
    }

    await session.navigateSidebar(page, config.navPath);
    console.log('After nav URL:', page.url());
    const html = await page.content();
    await writeFile(`/data/debug-${moduleKey}.html`, html);

    const tables = await page.locator('table').count();
    const links = await page.locator('a').count();
    console.log({ tables, links, title: await page.title() });

    // Print sidebar-like links
    const sidebarLinks = await page.locator('a').allTextContents();
    console.log('Sample links:', sidebarLinks.filter(Boolean).slice(0, 30));
  });

  await session.close();
}

main().catch(console.error);
