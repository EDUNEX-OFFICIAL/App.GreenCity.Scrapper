import { buildOpenApiSpec } from '@/modules/integration/openapi/spec';

export async function GET() {
  return Response.json(buildOpenApiSpec());
}
