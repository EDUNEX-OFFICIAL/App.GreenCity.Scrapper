import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { jsonSuccess } from '../lib/response';
import { BpService } from '../services/bp.service';
import {
  bpCodeParamSchema,
  bpDetailQuerySchema,
  bpListQuerySchema,
  parseQuery,
  uidParamSchema,
} from '../validators/index';

export const BpController = {
  async list(req: Request) {
    const url = new URL(req.url);
    let query;
    try {
      query = parseQuery(bpListQuerySchema, url.searchParams);
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const { items, total } = await BpService.list(query);
    return jsonSuccess(items, { page: query.page, limit: query.limit, total });
  },

  async getByCode(req: Request, bpCode: string) {
    const url = new URL(req.url);
    let code;
    let detailQuery;
    try {
      code = bpCodeParamSchema.parse({ bpCode }).bpCode;
      detailQuery = parseQuery(bpDetailQuerySchema, url.searchParams);
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const detail = await BpService.getByCode(code, detailQuery.uid);
    return jsonSuccess(detail);
  },

  async getByUid(_req: Request, uid: string) {
    let parsedUid;
    try {
      parsedUid = uidParamSchema.parse({ uid }).uid;
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const detail = await BpService.getByUid(parsedUid);
    return jsonSuccess(detail);
  },
};
