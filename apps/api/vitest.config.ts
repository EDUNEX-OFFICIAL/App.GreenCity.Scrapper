import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/integration/**/*.test.ts'],
    env: {
      VITEST: 'true',
      INTEGRATION_API_KEY: 'test-api-key',
      INTEGRATION_CORS_ORIGIN: 'https://mlm-erp.example.com',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
