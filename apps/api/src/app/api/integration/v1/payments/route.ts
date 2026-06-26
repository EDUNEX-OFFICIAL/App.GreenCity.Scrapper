import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { PaymentsController } from '@/modules/integration/controllers/payments.controller';

export const GET = createIntegrationHandler((req, _ctx) => PaymentsController.list(req));
