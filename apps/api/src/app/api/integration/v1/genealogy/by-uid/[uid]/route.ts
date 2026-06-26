import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { GenealogyController } from '@/modules/integration/controllers/genealogy.controller';

export const GET = createIntegrationHandler(async (req, ctx) => {
  const params = await ctx.params;
  return GenealogyController.getForUid(req, params.uid ?? '');
});
