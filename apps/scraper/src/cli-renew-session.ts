import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { adminUrl, createLogger, loadConfig } from '@greencity/shared';
import { disconnectPrisma } from '@greencity/db';
import { SessionManager } from './session/manager.js';
import { searchBpOnAdminList } from './session/panel.js';

const log = createLogger('renew-session');

async function main(): Promise<void> {
  const cfg = loadConfig();
  const adminPath = join(cfg.storageStateDir, 'admin.json');

  log.info('Removing stale admin session');
  await unlink(adminPath).catch(() => undefined);

  const session = new SessionManager();
  await session.ensureDirs();

  try {
    await session.withAdminPage(async (page) => {
      const homeUrl = adminUrl(cfg.erpBaseUrl, '/home/');
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (session.isLoginPage(page.url()) || (await page.locator('input[type="password"]').count()) > 0) {
        await session.loginAdmin(page);
        await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
      if (session.isLoginPage(page.url())) {
        throw new Error('Login verification failed — still on login page after renew');
      }

      await searchBpOnAdminList(page, '000chandan', session);
      const grid = page.locator('table[id*="GridView"] tr').filter({ hasText: /[a-zA-Z0-9]/ });
      const count = await grid.count();
      if (count < 1) {
        throw new Error('BP list grid empty after login — session may not be valid');
      }

      log.info({ gridRows: count, url: page.url() }, 'Session renewed and BP list verified');
    });
  } finally {
    await session.close();
  }

  await disconnectPrisma();
  log.info('Admin session saved to storage — workers can resume');
}

main().catch((err) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, 'Session renew failed');
  process.exit(1);
});
