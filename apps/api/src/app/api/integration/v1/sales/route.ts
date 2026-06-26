import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { SalesController } from '@/modules/integration/controllers/sales.controller';

export const GET = createIntegrationHandler((req, _ctx) => SalesController.list(req));
