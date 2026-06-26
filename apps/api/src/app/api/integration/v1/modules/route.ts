import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { ExtendedControllers } from '@/modules/integration/controllers/extended.controller';

export const GET = createIntegrationHandler((req, _ctx) => ExtendedControllers.moduleCatalog(req));
