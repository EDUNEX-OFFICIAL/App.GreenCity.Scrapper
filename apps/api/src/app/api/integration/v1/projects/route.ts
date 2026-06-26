import { createIntegrationHandler } from '@/modules/integration/middleware/integration-handler';
import { ProjectsController } from '@/modules/integration/controllers/projects.controller';

export const GET = createIntegrationHandler((req, _ctx) => ProjectsController.list(req));
