import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { ExtendedControllers } from '@/modules/integration/controllers/extended.controller';

export const GET = createIntegrationHandler(async (req, ctx) => {
  const params = await ctx.params;
  return ExtendedControllers.moduleRaw(req, params.moduleKey ?? '');
});
