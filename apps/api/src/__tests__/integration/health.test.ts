import { describe, expect, it } from 'vitest';
import { HealthService } from '../../modules/integration/services/health.service';

describe('Health endpoint', () => {
  it('returns healthy status shape', () => {
    const data = HealthService.get();
    expect(data.service).toBe('integration-api');
    expect(data.status).toBe('healthy');
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });
});
