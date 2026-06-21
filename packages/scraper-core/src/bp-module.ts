import type { Page } from 'playwright';
import type { GenealogyScrapeResult } from '@greencity/shared';

export interface BpHarvestContext {
  bpCode: string;
  bpName?: string;
  uid?: string;
  scrapeRunId: string;
}

export interface BpModuleResult {
  moduleKey: string;
  rowCount: number;
  metadata?: Record<string, unknown>;
  genealogy?: GenealogyScrapeResult;
}

export interface BpModule {
  name: string;
  execute(bpPage: Page, ctx: BpHarvestContext): Promise<BpModuleResult>;
}

export type BpModuleName = 'profile' | 'genealogy';

export const BP_MODULE_NAMES: BpModuleName[] = ['profile', 'genealogy'];
