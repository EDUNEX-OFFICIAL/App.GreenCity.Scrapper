import type { HealthResponse } from '../dto/health.dto';

export const HealthService = {
  get(): HealthResponse {
    return {
      service: 'integration-api',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  },
};
