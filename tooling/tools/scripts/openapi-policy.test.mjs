import assert from 'node:assert/strict';
import test from 'node:test';
import { validateExceptions } from './verify-openapi-contracts.mjs';
import { compareOpenApi } from './verify-deployed-openapi.mjs';
import { extractStaticUrlRoutes } from '../../scripts/policy/extract-static-url-routes.mjs';
const entry = { source: 'server/example.ts', owner: 'server/packages/runtime/http', trackingIssue: 'docs/runbooks/openapi-contract-migration.md#existing-exceptions', reason: 'Pending compatibility contract migration', expiresOn: '2026-10-06', operations: ['GET /legacy'] };
const document = { schemaVersion: 2, exceptions: [entry] };
const observed = new Set(['server/example.ts GET /legacy']);
const options = { today: '2026-09-06', previous: document };
test('exact exceptions do not exempt additional routes in the same file', () => {
  assert.deepEqual(validateExceptions(document, observed, options), []);
  const failures = validateExceptions(document, new Set([...observed, 'server/example.ts POST /new']), options);
  assert.equal(failures.length, 1); assert.match(failures[0], /Undocumented route/);
});
test('exceptions cannot grow, extend expiry, expire silently or survive migration', () => {
  const grow = { schemaVersion: 2, exceptions: [{ ...entry, operations: [...entry.operations, 'POST /new'] }] };
  assert.ok(validateExceptions(grow, new Set([...observed, 'server/example.ts POST /new']), options).some((s) => s.includes('growth')));
  assert.ok(validateExceptions({ ...document, exceptions: [{ ...entry, expiresOn: '2026-11-01' }] }, observed, options).some((s) => s.includes('extended')));
  assert.ok(validateExceptions(document, observed, { ...options, today: '2026-10-06' }).some((s) => s.includes('Expired')));
  assert.ok(validateExceptions(document, new Set(), options).some((s) => s.includes('Stale')));
});
test('exception metadata and expiry must be valid', () => {
  const failures = validateExceptions({ ...document, exceptions: [{ ...entry, expiresOn: '2026-02-30', owner: '', reason: '', trackingIssue: 'missing.md' }] }, observed, options);
  for (const text of ['owner', 'reason', 'tracking', 'Expired']) assert.ok(failures.some((s) => s.includes(text)));
});
test('raw aliases, finite helper paths and nonstandard methods are all policy inputs', () => {
  const result = extractStaticUrlRoutes(`function register(app) { app.get(['/a', '/b'], handler); for(const path of ['/c','/d']) app.post(path, handler); app.options('/e', handler); }`);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.routes.map((r) => r.method + ' ' + r.declaredPath).sort(), ['GET /a', 'GET /b', 'OPTIONS /e', 'POST /c', 'POST /d']);
});
test('renamed receivers, arrow registrars and unsupported registration styles cannot bypass the scanner', () => {
  const result = extractStaticUrlRoutes(`export const register = (server: Application) => { const alias = server; alias.post('/new', handler); server[method]('/computed', handler); server.route('/chain').get(handler); server.use('/hidden', handler); };`);
  assert.deepEqual(result.routes.map((route) => route.declaredPath), ['/new']);
  assert.equal(result.unresolved.length, 3);
});
const spec = { openapi: '3.1.0', info: { title: 'Test', version: '1' }, paths: { '/a': { get: { operationId: 'a.get', responses: { 200: { description: 'OK' } } } } }, components: { schemas: { Value: { type: 'string' } } } };
test('deployment verification ignores object ordering but catches schemas, permissions and missing/extra routes', () => {
  assert.deepEqual(compareOpenApi(spec, { components: spec.components, paths: spec.paths, info: spec.info, openapi: spec.openapi }), []);
  const changed = structuredClone(spec); changed.paths['/a'].get.security = [{ bearerAuth: [] }];
  assert.match(compareOpenApi(spec, changed)[0], /Changed/);
  const schema = structuredClone(spec); schema.components.schemas.Value.type = 'number';
  assert.match(compareOpenApi(spec, schema)[0], /shared schemas/);
  const missing = structuredClone(spec); missing.paths = { '/b': spec.paths['/a'] };
  assert.deepEqual(compareOpenApi(spec, missing), ['Missing deployed operation: GET /a', 'Unexpected deployed operation: GET /b']);
  assert.throws(() => compareOpenApi({}, spec), /nonempty/);
});
