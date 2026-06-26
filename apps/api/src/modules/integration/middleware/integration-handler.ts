import { randomUUID } from 'node:crypto';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { loadIntegrationConfig } from '../lib/config';
import { AppError } from '../lib/errors';
import { handleControllerError } from '../lib/response';

type RouteContext = { params: Promise<Record<string, string>> };

type IntegrationHandler = (
  req: Request,
  ctx: RouteContext,
) => Promise<Response> | Response;

let rateLimiter: RateLimiterRedis | null = null;

function getRateLimiter(): RateLimiterRedis {
  if (!rateLimiter) {
    const cfg = loadIntegrationConfig();
    const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    rateLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'integration_rl',
      points: cfg.rateLimitPoints,
      duration: cfg.rateLimitDuration,
    });
  }
  return rateLimiter;
}

function validateApiKey(req: Request): void {
  const cfg = loadIntegrationConfig();
  if (!cfg.apiKey) {
    throw new AppError('Integration API key not configured', 503);
  }
  const key = req.headers.get('x-api-key');
  if (!key || key !== cfg.apiKey) {
    throw AppError.unauthorized();
  }
}

function applyCors(req: Request, res: Response): Response {
  const cfg = loadIntegrationConfig();
  const origin = req.headers.get('origin');
  const headers = new Headers(res.headers);
  if (origin && origin === cfg.corsOrigin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'x-api-key, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function logRequest(
  requestId: string,
  method: string,
  path: string,
  status: number,
  durationMs: number,
): void {
  console.info(
    JSON.stringify({
      requestId,
      method,
      path,
      status,
      durationMs,
      service: 'integration-api',
    }),
  );
}

export function createIntegrationHandler(handler: IntegrationHandler) {
  return async (req: Request, ctx: RouteContext): Promise<Response> => {
    const start = Date.now();
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    const path = new URL(req.url).pathname;

    if (req.method === 'OPTIONS') {
      return applyCors(req, new Response(null, { status: 204 }));
    }

    try {
      validateApiKey(req);
      if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
        try {
          const limiter = getRateLimiter();
          const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
          await limiter.consume(clientIp);
        } catch (rlErr) {
          if (rlErr instanceof AppError) throw rlErr;
          const isRateLimit =
            rlErr && typeof rlErr === 'object' && 'msBeforeNext' in rlErr;
          if (isRateLimit) throw AppError.tooManyRequests();
          console.warn(
            JSON.stringify({
              service: 'integration-api',
              warning: 'rate_limiter_unavailable',
              message: rlErr instanceof Error ? rlErr.message : 'Redis unavailable',
            }),
          );
        }
      }
    } catch (err) {
      const status = err instanceof AppError ? err.statusCode : 429;
      const message =
        err instanceof AppError
          ? err.message
          : err && typeof err === 'object' && 'msBeforeNext' in err
            ? 'Rate limit exceeded'
            : 'Request rejected';
      const res = handleControllerError(
        err instanceof AppError ? err : AppError.tooManyRequests(message),
      );
      res.headers.set('x-request-id', requestId);
      logRequest(requestId, req.method, path, status, Date.now() - start);
      return applyCors(req, res);
    }

    try {
      const res = await handler(req, ctx);
      res.headers.set('x-request-id', requestId);
      logRequest(requestId, req.method, path, res.status, Date.now() - start);
      return applyCors(req, res);
    } catch (err) {
      const res = handleControllerError(err);
      res.headers.set('x-request-id', requestId);
      logRequest(requestId, req.method, path, res.status, Date.now() - start);
      return applyCors(req, res);
    }
  };
}
