import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { jsonSuccess } from '../lib/response';
import { ProjectsService } from '../services/projects.service';
import { parseQuery, projectsQuerySchema } from '../validators/index';

export const ProjectsController = {
  async list(req: Request) {
    const url = new URL(req.url);
    let query;
    try {
      query = parseQuery(projectsQuerySchema, url.searchParams);
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const { items, total } = await ProjectsService.list(query);
    return jsonSuccess(items, { page: query.page, limit: query.limit, total });
  },
};
