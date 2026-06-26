import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { jsonSuccess } from '../lib/response';
import { GenealogyService } from '../services/genealogy.service';
import { bpCodeParamSchema, bpDetailQuerySchema, parseQuery, uidParamSchema } from '../validators/index';

export const GenealogyController = {
  async getForBp(req: Request, bpCode: string) {
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
    const data = await GenealogyService.getForBp(code, detailQuery.uid);
    return jsonSuccess(data);
  },

  async getForUid(_req: Request, uid: string) {
    let parsedUid;
    try {
      parsedUid = uidParamSchema.parse({ uid }).uid;
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const data = await GenealogyService.getForUid(parsedUid);
    return jsonSuccess(data);
  },
};
