import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleConfig } from '../modules/types.js';
import type { PageInspectResult, PageSelectors } from './types.js';

const GENERATED_DIR =
  process.env.SELECTORS_GENERATED_DIR ??
  join(process.cwd(), 'packages/shared/src/selectors/generated');

export function loadGeneratedProfileSync(moduleKey: string): PageInspectResult | null {
  const filePath = join(GENERATED_DIR, `${moduleKey}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as PageInspectResult;
  } catch {
    return null;
  }
}

export function loadGeneratedSelectorsSync(moduleKey: string): PageSelectors | undefined {
  return loadGeneratedProfileSync(moduleKey)?.suggestedSelectors;
}

export function enrichModuleFromGenerated(config: ModuleConfig): ModuleConfig {
  const profile = loadGeneratedProfileSync(config.key);
  if (!profile) return config;

  return {
    ...config,
    selectors: { ...profile.suggestedSelectors, ...config.selectors },
    extractMode: config.extractMode ?? profile.extractMode,
  };
}

export function listGeneratedProfiles(): string[] {
  if (!existsSync(GENERATED_DIR)) return [];
  return readdirSync(GENERATED_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

export async function loadGeneratedProfile(moduleKey: string): Promise<PageInspectResult | null> {
  return loadGeneratedProfileSync(moduleKey);
}

export async function loadGeneratedSelectors(moduleKey: string): Promise<PageSelectors | undefined> {
  return loadGeneratedSelectorsSync(moduleKey);
}

export function mergeWithGenerated(
  moduleKey: string,
  base?: PageSelectors,
  generated?: PageSelectors,
): PageSelectors | undefined {
  if (!base && !generated) return undefined;
  return { ...generated, ...base };
}
