import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { jsonSuccess } from '../lib/response';
import { parseQuery, projectsQuerySchema, salesQuerySchema } from '../validators/index';
import {
  AccountingEntitiesService,
  BanksService,
  BranchesService,
  IncomeBySaleEarningService,
  PlotsService,
  SaleTransactionsService,
  TransactionsService,
} from '../services/extended.service';
import { ModuleCatalogService } from '../services/module-catalog.service';
import { ModuleRawService } from '../services/module-raw.service';

async function listWithSchema<T extends { updatedAt: string }>(
  req: Request,
  schema: typeof salesQuerySchema | typeof projectsQuerySchema,
  listFn: (q: {
    page: number;
    limit: number;
    updatedAfter?: Date;
    from?: Date;
    to?: Date;
  }) => Promise<{ items: T[]; total: number }>,
) {
  const url = new URL(req.url);
  let query;
  try {
    query = parseQuery(schema, url.searchParams);
  } catch (err) {
    if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
    throw err;
  }
  const { items, total } = await listFn(query);
  return jsonSuccess(items, { page: query.page, limit: query.limit, total });
}

export const ExtendedControllers = {
  transactions: (req: Request) => listWithSchema(req, salesQuerySchema, (q) => TransactionsService.list(q)),
  saleTransactions: async (req: Request) => {
    const url = new URL(req.url);
    let query;
    try {
      query = parseQuery(salesQuerySchema, url.searchParams);
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const { items, total } = await SaleTransactionsService.list(query);
    return jsonSuccess(items, { page: query.page, limit: query.limit, total });
  },
  incomeBySaleEarning: (req: Request) =>
    listWithSchema(req, salesQuerySchema, (q) => IncomeBySaleEarningService.list(q)),
  plots: (req: Request) => listWithSchema(req, projectsQuerySchema, (q) => PlotsService.list(q)),
  branches: (req: Request) => listWithSchema(req, projectsQuerySchema, (q) => BranchesService.list(q)),
  banks: (req: Request) => listWithSchema(req, projectsQuerySchema, (q) => BanksService.list(q)),
  accountingEntities: (req: Request) =>
    listWithSchema(req, projectsQuerySchema, (q) => AccountingEntitiesService.list(q)),

  async moduleCatalog(_req: Request) {
    const items = await ModuleCatalogService.list();
    return jsonSuccess(items, { page: 1, limit: items.length, total: items.length });
  },

  async moduleRaw(req: Request, moduleKey: string) {
    const url = new URL(req.url);
    let query;
    try {
      query = parseQuery(projectsQuerySchema, url.searchParams);
    } catch (err) {
      if (err instanceof ZodError) throw AppError.badRequest('Validation failed', err.issues);
      throw err;
    }
    const { items, total } = await ModuleRawService.list({ moduleKey, ...query });
    return jsonSuccess(items, { page: query.page, limit: query.limit, total });
  },
};
