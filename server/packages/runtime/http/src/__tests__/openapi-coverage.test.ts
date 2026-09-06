import express from 'express';
import { describe, expect, it } from 'vitest';
import { auditRouteContracts, defineRouteContract, registerContractRoute } from '../route-contract.js';
import { createHttpApplication } from '../http-runtime.js';

describe('actual Express contract coverage', () => {
  it('detects every alias and every explicitly registered HTTP method', () => {
    const app = express();
    app.get(['/api/native/:id', '/api/compat/:id'], (_request, response) => response.end());
    app.head('/api/head-only', (_request, response) => response.end());
    app.options('/api/options-only', (_request, response) => response.end());
    const issues = auditRouteContracts(app);
    expect(issues).toHaveLength(4);
    for (const path of ['/api/native/:id', '/api/compat/:id', '/api/head-only', '/api/options-only']) expect(issues.some((issue) => issue.message.includes(path))).toBe(true);
  });
  it('fails closed for mounted routers and regex paths', () => {
    const app = express(), router = express.Router();
    router.get('/hidden', (_request, response) => response.end());
    app.use('/api', router);
    app.get(/regex/, (_request, response) => response.end());
    expect(auditRouteContracts(app).filter((issue) => issue.code === 'UNINSPECTABLE_ROUTE')).toHaveLength(2);
  });
  it('strict construction fails for uncontracted aliases and passes fully registered aliases', () => {
    expect(() => createHttpApplication({ openApi: { title: 'Test', version: '1', enforceContracts: true }, configure(app) {
      app.post(['/a', '/b'], (_request, response) => response.end());
    } })).toThrow('Undocumented HTTP route');
    expect(() => createHttpApplication({ openApi: { title: 'Test', version: '1', enforceContracts: true }, configure(app) {
      for (const path of ['/a', '/b']) registerContractRoute(app, defineRouteContract({ method: 'get', path, operationId: `test.${path.slice(1)}`, summary: path, responses: { 200: { description: 'OK', body: { type: 'object' } } } }), (_request, response) => response.json({}));
    } })).not.toThrow();
  });
});
