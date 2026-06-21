import type { Page } from 'playwright';
import type { BpHarvestContext, BpModule, BpModuleResult } from '../bp-module.js';
import { genealogyMetrics } from '../metrics.js';

export type GenealogyScraperFn = (page: Page, rootBpCode: string) => Promise<import('@greencity/shared').GenealogyScrapeResult>;

export class GenealogyModule implements BpModule {
  name = 'genealogy';
  private scrapeFn: GenealogyScraperFn;

  constructor(scrapeFn: GenealogyScraperFn) {
    this.scrapeFn = scrapeFn;
  }

  async execute(bpPage: Page, ctx: BpHarvestContext): Promise<BpModuleResult> {
    const result = await genealogyMetrics.time('tree_extract_ms', () =>
      this.scrapeFn(bpPage, ctx.bpCode),
    { bpCode: ctx.bpCode });
    return {
      moduleKey: this.name,
      rowCount: result.nodes.length,
      metadata: {
        nodesUpserted: result.nodes.length,
        edgesUpserted: result.edges.length,
      },
      genealogy: result,
    };
  }
}
