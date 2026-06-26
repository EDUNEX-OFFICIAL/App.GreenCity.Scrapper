import { z } from 'zod';
import { dateRangeSchema, paginationSchema, updatedAfterSchema } from './pagination.validator';

export const bpCodeParamSchema = z.object({
  bpCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid BP code format'),
});

export const bpListQuerySchema = paginationSchema.merge(updatedAfterSchema).extend({
  search: z.string().max(100).optional(),
  uid: z.string().regex(/^\d+$/, 'uid must be numeric').optional(),
});

export const bpDetailQuerySchema = z.object({
  uid: z.string().regex(/^\d+$/, 'uid must be numeric').optional(),
});

export const uidParamSchema = z.object({
  uid: z.string().regex(/^\d+$/, 'uid must be numeric'),
});

export const salesQuerySchema = paginationSchema.merge(updatedAfterSchema).merge(dateRangeSchema);

export const paymentsQuerySchema = paginationSchema
  .merge(updatedAfterSchema)
  .merge(dateRangeSchema)
  .extend({
    type: z
      .enum([
        'neft',
        'receipt',
        'bp_payout',
        'bulk_payment',
        'reward_emi',
        'reward',
        'income',
        'income_summary',
      ])
      .optional(),
  });

export const moduleKeyParamSchema = z.object({
  moduleKey: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'Invalid module key'),
});

export const projectsQuerySchema = paginationSchema.merge(updatedAfterSchema);

export type BpListQuery = z.infer<typeof bpListQuerySchema>;
export type BpDetailQuery = z.infer<typeof bpDetailQuerySchema>;
export type SalesQuery = z.infer<typeof salesQuerySchema>;
export type PaymentsQuery = z.infer<typeof paymentsQuerySchema>;
export type ProjectsQuery = z.infer<typeof projectsQuerySchema>;
