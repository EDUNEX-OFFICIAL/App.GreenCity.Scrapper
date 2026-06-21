import type { Page } from 'playwright';
import type { BpModule, BpModuleName, BpHarvestContext, BpModuleResult } from './bp-module.js';
import { ProfileModule } from './modules/profile-module.js';
import { GenealogyModule, type GenealogyScraperFn } from './modules/genealogy-module.js';

export function createBpModuleRegistry(scrapeGenealogy: GenealogyScraperFn): Map<string, BpModule> {
  return new Map<string, BpModule>([
    ['profile', new ProfileModule()],
    ['genealogy', new GenealogyModule(scrapeGenealogy)],
  ]);
}

export async function runBpModules(
  bpPage: Page,
  ctx: BpHarvestContext,
  moduleNames: BpModuleName[],
  registry: Map<string, BpModule>,
): Promise<BpModuleResult[]> {
  const results: BpModuleResult[] = [];
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
