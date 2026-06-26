export interface IntegrationConfig {
  apiKey: string;
  corsOrigin: string;
  rateLimitPoints: number;
  rateLimitDuration: number;
  redisUrl: string;
}

export function loadIntegrationConfig(): IntegrationConfig {
  return {
    apiKey: process.env.INTEGRATION_API_KEY ?? '',
    corsOrigin: process.env.INTEGRATION_CORS_ORIGIN ?? 'https://mlm-erp.example.com',
    rateLimitPoints: Number.parseInt(process.env.INTEGRATION_RATE_LIMIT_POINTS ?? '100', 10),
    rateLimitDuration: Number.parseInt(process.env.INTEGRATION_RATE_LIMIT_DURATION ?? '60', 10),
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  };
}
