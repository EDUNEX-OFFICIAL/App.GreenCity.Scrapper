import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIntegrationHandler } from '../../modules/integration/middleware/integration-handler';
import { HealthController } from '../../modules/integration/controllers/health.controller';

describe('Integration API authentication', () => {
  beforeEach(() => {
    process.env.INTEGRATION_API_KEY = 'test-api-key';
  });

  const handler = createIntegrationHandler((_req, _ctx) => HealthController.get());
  const ctx = { params: Promise.resolve({}) };

  it('returns 401 when API key is missing', async () => {
    const req = new Request('http://localhost/api/integration/v1/health');
    const res = await handler(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when API key is invalid', async () => {
    const req = new Request('http://localhost/api/integration/v1/health', {
      headers: { 'x-api-key': 'wrong-key' },
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 200 when API key is valid', async () => {
    const req = new Request('http://localhost/api/integration/v1/health', {
      headers: { 'x-api-key': 'test-api-key' },
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.service).toBe('integration-api');
  });
});
