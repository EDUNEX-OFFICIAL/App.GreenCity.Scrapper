import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { BpController } from '@/modules/integration/controllers/bp.controller';

export const GET = createIntegrationHandler((req, _ctx) => BpController.list(req));
