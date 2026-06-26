import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { HealthController } from '@/modules/integration/controllers/health.controller';

export const GET = createIntegrationHandler((_req, _ctx) => HealthController.get());
