import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { jsonSuccess } from '../lib/response';
import { PaymentsService } from '../services/payments.service';
import { parseQuery, paymentsQuerySchema } from '../validators/index';

export const PaymentsController = {
  async list(req: Request) {
    const url = new URL(req.url);
    let query;
    try {
      query = parseQuery(paymentsQuerySchema, url.searchParams);
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const { items, total } = await PaymentsService.list(query);
    return jsonSuccess(items, { page: query.page, limit: query.limit, total });
  },
};
