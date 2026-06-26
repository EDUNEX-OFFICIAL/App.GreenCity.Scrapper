export function buildOpenApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'GreenCityERP Integration API',
      version: '1.0.0',
      description:
        'REST API for MLM ERP to consume scraped Green City ERP data. Authentication via x-api-key header.',
    },
    servers: [{ url: '/api/integration/v1', description: 'Integration API v1' }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {},
            meta: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
              },
            },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
          },
        },
        BpListItem: {
          type: 'object',
          properties: {
            bpCode: { type: 'string', example: 'BP12345' },
            name: { type: 'string' },
            mobile: { type: 'string' },
            status: { type: 'string' },
            sponsorCode: { type: 'string' },
            joiningDate: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        GenealogyResponse: {
          type: 'object',
          properties: {
            bpCode: { type: 'string' },
            sponsorTree: { type: 'array', items: { $ref: '#/components/schemas/GenealogyTreeNode' } },
            binaryTree: { type: 'array', items: { $ref: '#/components/schemas/GenealogyTreeNode' } },
          },
        },
        GenealogyTreeNode: {
          type: 'object',
          properties: {
            bpCode: { type: 'string' },
            bpName: { type: 'string' },
            leg: { type: 'string', enum: ['left', 'right', 'sponsor'] },
            children: { type: 'array', items: { $ref: '#/components/schemas/GenealogyTreeNode' } },
          },
        },
      },
      parameters: {
        Page: { name: 'page', in: 'query', schema: { type: 'integer', default: 1, minimum: 1 } },
        Limit: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 100, minimum: 1, maximum: 1000 },
        },
        UpdatedAfter: {
          name: 'updatedAfter',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          description: 'Return only records updated on or after this ISO timestamp (delta sync).',
        },
        Search: { name: 'search', in: 'query', schema: { type: 'string' } },
        From: { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
        To: { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        BpCode: { name: 'bpCode', in: 'path', required: true, schema: { type: 'string' } },
        PaymentType: {
          name: 'type',
          in: 'query',
          schema: {
            type: 'string',
            enum: [
              'neft',
              'receipt',
              'bp_payout',
              'bulk_payment',
              'reward_emi',
              'reward',
              'income',
              'income_summary',
            ],
          },
        },
        ModuleKey: {
          name: 'moduleKey',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^[a-z0-9_]+$' },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          tags: ['System'],
          responses: {
            '200': {
              description: 'Service healthy',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    data: {
                      service: 'integration-api',
                      status: 'healthy',
                      timestamp: '2026-06-23T10:00:00.000Z',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/bps': {
        get: {
          summary: 'List Business Partners',
          tags: ['BPs'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
            { $ref: '#/components/parameters/Search' },
          ],
          responses: {
            '200': {
              description: 'Paginated BP list',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    data: [
                      {
                        bpCode: 'BP12345',
                        name: 'John Doe',
                        mobile: '9876543210',
                        status: 'Active',
                        sponsorCode: 'BP00001',
                        joiningDate: '2024-01-15',
                        updatedAt: '2026-06-20T10:00:00.000Z',
                      },
                    ],
                    meta: { page: 1, limit: 100, total: 1 },
                  },
                },
              },
            },
            '401': { description: 'Invalid API key' },
          },
        },
      },
      '/bps/{bpCode}': {
        get: {
          summary: 'Get BP details',
          tags: ['BPs'],
          parameters: [{ $ref: '#/components/parameters/BpCode' }],
          responses: {
            '200': { description: 'BP detail' },
            '404': { description: 'BP not found' },
          },
        },
      },
      '/genealogy/{bpCode}': {
        get: {
          summary: 'Get BP genealogy trees',
          tags: ['Genealogy'],
          parameters: [{ $ref: '#/components/parameters/BpCode' }],
          responses: {
            '200': {
              description: 'Sponsor and binary trees',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GenealogyResponse' },
                },
              },
            },
            '404': { description: 'Genealogy not found' },
          },
        },
      },
      '/sales': {
        get: {
          summary: 'List sales',
          tags: ['Sales'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
            { $ref: '#/components/parameters/From' },
            { $ref: '#/components/parameters/To' },
          ],
          responses: { '200': { description: 'Paginated sales' } },
        },
      },
      '/payments': {
        get: {
          summary: 'List payments (NEFT, receipts, payouts, income)',
          tags: ['Payments'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
            { $ref: '#/components/parameters/From' },
            { $ref: '#/components/parameters/To' },
            { $ref: '#/components/parameters/PaymentType' },
          ],
          responses: { '200': { description: 'Paginated payments' } },
        },
      },
      '/transactions': {
        get: {
          summary: 'List accounting transactions',
          tags: ['Accounting'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
            { $ref: '#/components/parameters/From' },
            { $ref: '#/components/parameters/To' },
          ],
          responses: { '200': { description: 'Paginated accounting transactions' } },
        },
      },
      '/sale-transactions': {
        get: {
          summary: 'List sale transactions (deduplicated by deposit id)',
          tags: ['Sales'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
            { $ref: '#/components/parameters/From' },
            { $ref: '#/components/parameters/To' },
          ],
          responses: { '200': { description: 'Paginated sale transactions' } },
        },
      },
      '/income-by-sale-earning': {
        get: {
          summary: 'List BP income by sale earning',
          tags: ['BP Management'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
            { $ref: '#/components/parameters/From' },
            { $ref: '#/components/parameters/To' },
          ],
          responses: { '200': { description: 'Paginated income by sale earning rows' } },
        },
      },
      '/plots': {
        get: {
          summary: 'List plots (plot_list, registered_plot_list, govt_survey_plot)',
          tags: ['Plots'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
          ],
          responses: { '200': { description: 'Paginated plots' } },
        },
      },
      '/branches': {
        get: {
          summary: 'List branches',
          tags: ['Master Data'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
          ],
          responses: { '200': { description: 'Paginated branches' } },
        },
      },
      '/banks': {
        get: {
          summary: 'List master banks',
          tags: ['Master Data'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
          ],
          responses: { '200': { description: 'Paginated banks' } },
        },
      },
      '/accounting-entities': {
        get: {
          summary: 'List accounting entities',
          tags: ['Accounting'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
          ],
          responses: { '200': { description: 'Paginated accounting entities' } },
        },
      },
      '/modules': {
        get: {
          summary: 'Module catalog (row counts and API availability)',
          tags: ['Catalog'],
          responses: { '200': { description: 'List of scraped modules' } },
        },
      },
      '/modules/{moduleKey}': {
        get: {
          summary: 'Raw scraped rows for an allowlisted module',
          tags: ['Catalog'],
          parameters: [
            { $ref: '#/components/parameters/ModuleKey' },
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
          ],
          responses: {
            '200': { description: 'Paginated raw rows' },
            '400': { description: 'Module not allowlisted' },
          },
        },
      },
      '/projects': {
        get: {
          summary: 'List projects',
          tags: ['Projects'],
          parameters: [
            { $ref: '#/components/parameters/Page' },
            { $ref: '#/components/parameters/Limit' },
            { $ref: '#/components/parameters/UpdatedAfter' },
          ],
          responses: { '200': { description: 'Paginated projects' } },
        },
      },
    },
  };
}
