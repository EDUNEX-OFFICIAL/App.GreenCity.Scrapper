import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { BpController } from '@/modules/integration/controllers/bp.controller';

export const GET = createIntegrationHandler(async (req, ctx) => {
  const params = await ctx.params;
  return BpController.getByUid(req, params.uid ?? '');
});
