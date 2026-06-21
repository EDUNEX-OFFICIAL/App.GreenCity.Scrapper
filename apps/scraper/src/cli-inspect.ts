import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  adminUrl,
  getAllAdminModules,
  getModuleConfig,
  loadConfig,
  type ModuleConfig,
} from '@greencity/shared';
import { disconnectPrisma } from '@greencity/db';
import { SessionManager } from './session/manager.js';
import { inspectPage } from './extractors/page-inspector.js';

const moduleKeyArg = process.argv[2];
const OUT_DIR =
  process.env.INSPECT_OUT_DIR ??
  join(process.cwd(), 'packages/shared/src/selectors/generated');

async function inspectModule(session: SessionManager, config: ModuleConfig): Promise<void> {
  const cfg = loadConfig();
  if (!config.directUrl) {
    console.warn(`Skip ${config.key}: no directUrl`);
    return;
  }

  await session.withAdminPage(async (page) => {
    const url = adminUrl(cfg.erpBaseUrl, config.directUrl as string);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() =>
      page.goto(url, { waitUntil: 'domcontentloaded' }),
    );
    await page.waitForTimeout(2000);

    const result = await inspectPage(page, config, page.url());
    await mkdir(OUT_DIR, { recursive: true });
    const outPath = join(OUT_DIR, `${config.key}.json`);
    await writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(`✓ ${config.key} → ${result.template} (${result.gridTables.length} grids) → ${outPath}`);
  });
}

async function main() {
  const session = new SessionManager();
  const modules = moduleKeyArg
    ? [getModuleConfig(moduleKeyArg)].filter(Boolean) as ModuleConfig[]
    : getAllAdminModules().filter((m) => m.directUrl);

  console.log(`Inspecting ${modules.length} module(s)...`);
  for (const mod of modules) {
    try {
      await inspectModule(session, mod);
    } catch (err) {
      console.error(`✗ ${mod.key}:`, err instanceof Error ? err.message : err);
    }
  }

  await session.close();
  await disconnectPrisma();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
