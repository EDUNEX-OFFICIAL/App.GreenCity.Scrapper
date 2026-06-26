import type { Page } from 'playwright';
import { bpUrl, createLogger, loadConfig } from '@greencity/shared';
import type { BpModule, BpModuleName, BpHarvestContext, BpModuleResult } from './bp-module.js';
import { withExtraPage } from './browser-resources.js';
import { isHttpGenealogyConfigured, isHttpGenealogyHtmlEnabled } from './http-harvest.js';
import { ProfileModule } from './modules/profile-module.js';
import { GenealogyModule, type GenealogyScraperFn } from './modules/genealogy-module.js';

const log = createLogger('bp-harvest');

export function createBpModuleRegistry(scrapeGenealogy: GenealogyScraperFn): Map<string, BpModule> {
  return new Map<string, BpModule>([
    ['profile', new ProfileModule()],
    ['genealogy', new GenealogyModule(scrapeGenealogy)],
  ]);
}

function isParallelModulesEnabled(): boolean {
  return process.env.GENEALOGY_PARALLEL_MODULES !== 'false';
}

/** Profile reads home-page DOM; genealogy navigates tree pages — no data dependency. */
function canRunProfileAndGenealogyParallel(moduleNames: BpModuleName[]): boolean {
  return (
    isParallelModulesEnabled() &&
    moduleNames.includes('profile') &&
    moduleNames.includes('genealogy')
  );
}

/**
 * Profile on a dedicated Page at BP home; genealogy on bpPage (+ binary tab from Fix 2).
 * Same BrowserContext — cookies shared across pages.
 */
async function runProfileAndGenealogyParallel(
  bpPage: Page,
  ctx: BpHarvestContext,
  registry: Map<string, BpModule>,
): Promise<Map<BpModuleName, BpModuleResult>> {
  const profileMod = registry.get('profile');
  const genealogyMod = registry.get('genealogy');
  if (!profileMod || !genealogyMod) {
    throw new Error('Profile and genealogy modules required for parallel harvest');
  }

  const cfg = loadConfig();
  const defaultHome = bpUrl(cfg.erpBaseUrl, '/Default.aspx');
  const homeUrl =
    /\/_bp\//i.test(bpPage.url()) && !/Login\.aspx/i.test(bpPage.url()) ? bpPage.url() : defaultHome;

  return withExtraPage(bpPage, async (profilePage) => {
    await profilePage.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const [profileResult, genealogyResult] = await Promise.all([
      profileMod.execute(profilePage, ctx),
      genealogyMod.execute(bpPage, ctx),
    ]);
    log.info({ bpCode: ctx.bpCode, mode: 'parallel_modules' }, 'Profile + genealogy harvested in parallel');
    return new Map<BpModuleName, BpModuleResult>([
      ['profile', profileResult],
      ['genealogy', genealogyResult],
    ]);
  });
}

export async function runBpModules(
  bpPage: Page,
  ctx: BpHarvestContext,
  moduleNames: BpModuleName[],
  registry: Map<string, BpModule>,
): Promise<BpModuleResult[]> {
  const results: BpModuleResult[] = [];

  if (canRunProfileAndGenealogyParallel(moduleNames)) {
    const parallelResults = await runProfileAndGenealogyParallel(bpPage, ctx, registry);
    for (const name of moduleNames) {
      const parallel = parallelResults.get(name);
      if (parallel) {
        results.push(parallel);
        continue;
      }
      const mod = registry.get(name);
      if (!mod) throw new Error(`Unknown BP module: ${name}`);
      results.push(await mod.execute(bpPage, ctx));
    }
    return results;
  }

  for (const name of moduleNames) {
    const mod = registry.get(name);
    if (!mod) throw new Error(`Unknown BP module: ${name}`);
    results.push(await mod.execute(bpPage, ctx));
  }
  return results;
}

export function getGenealogyAuthMode(): 'direct_login' | 'admin_panel' | 'auto' {
  const mode = process.env.GENEALOGY_AUTH_MODE ?? 'auto';
  if (mode === 'direct_login' || mode === 'admin_panel' || mode === 'auto') return mode;
  return 'auto';
}

/** HTTP password login is skipped when opening BP panels via admin Settings → Panel. */
export function shouldUseHttpGenealogyHarvest(): boolean {
  if (getGenealogyAuthMode() === 'admin_panel') return false;
  return isHttpGenealogyConfigured();
}

/** Admin opens panel (cookie) → HTTP fetches TreeSponsor/TreeBinary HTML (no password, no Playwright trees). */
export function isAdminPanelHttpHybridEnabled(): boolean {
  return getGenealogyAuthMode() === 'admin_panel' && isHttpGenealogyHtmlEnabled();
}
