import { NextResponse } from 'next/server';
import { AppError } from './errors';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  message: string;
  errors?: unknown[];
}

export function jsonSuccess<T>(data: T, meta?: PaginationMeta, init?: ResponseInit): NextResponse {
  const body: SuccessResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  return NextResponse.json(body, init);
}

export function jsonError(
  message: string,
  status: number,
  errors?: unknown[],
  init?: ResponseInit,
): NextResponse {
  const body: ErrorResponse = { success: false, message };
  if (errors?.length) body.errors = errors;
  return NextResponse.json(body, { status, ...init });
}

export function handleControllerError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return jsonError(err.message, err.statusCode, err.errors);
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  return jsonError(message, 500);
}
