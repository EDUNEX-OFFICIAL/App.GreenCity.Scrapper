import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { jsonSuccess } from '../lib/response';
import { SalesService } from '../services/sales.service';
import { parseQuery, salesQuerySchema } from '../validators/index';

export const SalesController = {
  async list(req: Request) {
    const url = new URL(req.url);
    let query;
    try {
      query = parseQuery(salesQuerySchema, url.searchParams);
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const { items, total } = await SalesService.list(query);
    return jsonSuccess(items, { page: query.page, limit: query.limit, total });
  },
};
