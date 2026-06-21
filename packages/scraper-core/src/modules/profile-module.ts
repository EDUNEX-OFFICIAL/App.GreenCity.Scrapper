import type { Page } from 'playwright';
import { createLogger } from '@greencity/shared';
import type { BpHarvestContext, BpModule, BpModuleResult } from '../bp-module.js';

const log = createLogger('profile-module');

export class ProfileModule implements BpModule {
  name = 'profile';

  async execute(bpPage: Page, ctx: BpHarvestContext): Promise<BpModuleResult> {
    const profile = await bpPage.evaluate(() => {
      const title = document.title;
      const h1 = document.querySelector('h1, .page-title, .content-header h1');
      const welcome = document.querySelector('[class*="welcome"], [id*="Welcome"]');
      return {
        title,
        pageHeading: (h1?.textContent ?? '').replace(/\s+/g, ' ').trim() || undefined,
        welcomeText: (welcome?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || undefined,
        url: location.href,
      };
    });
    log.info({ bpCode: ctx.bpCode, profile }, 'Profile snapshot captured');
    return {
      moduleKey: this.name,
      rowCount: 1,
      metadata: { profile },
    };
  }
}
