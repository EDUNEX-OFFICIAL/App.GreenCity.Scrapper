export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface PaginationQuery {
  page: number;
  limit: number;
}

export interface DeltaSyncQuery {
  updatedAfter?: Date;
}

export interface DateRangeQuery {
  from?: Date;
  to?: Date;
}
