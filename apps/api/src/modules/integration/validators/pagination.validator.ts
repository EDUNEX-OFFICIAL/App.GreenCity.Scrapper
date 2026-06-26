import { z } from 'zod';

function parseOptionalIsoDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new z.ZodError([
      {
        code: 'custom',
        message: 'Invalid datetime',
        path: [],
      },
    ]);
  }
  return d;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export const updatedAfterSchema = z.object({
  updatedAfter: z
    .string()
    .optional()
    .transform((v) => parseOptionalIsoDate(v)),
});

export const dateRangeSchema = z.object({
  from: z
    .string()
    .optional()
    .transform((v) => parseOptionalIsoDate(v)),
  to: z
    .string()
    .optional()
    .transform((v) => parseOptionalIsoDate(v)),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type UpdatedAfterInput = z.infer<typeof updatedAfterSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  searchParams: URLSearchParams,
): z.infer<T> {
  const obj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  return schema.parse(obj);
}
