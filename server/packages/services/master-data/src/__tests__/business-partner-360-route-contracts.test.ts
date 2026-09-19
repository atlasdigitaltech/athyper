import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpApplication } from '@athyper/server-runtime-http';
import { registerBusinessPartner360Routes } from '../business-partner-360-routes.js';
import { MasterDataError } from '../errors.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }))); });
const id = '11111111-1111-4111-8111-111111111111';
async function fixture({ deny = false, malformed = false, forbidden = false, canComment = false } = {}) {
  const reveal = vi.fn(async () => {
    if (forbidden) throw new MasterDataError(403, 'BP_360_SECTION_FORBIDDEN', 'Forbidden');
    return malformed ? { value: 123 } : { bankAccountLinkId: id, value: 'protected-value', expiresAt: '2026-09-06T12:00:00Z', provenance: [] };
  });
  const comment = vi.fn(async () => ({id}));
  const summary = vi.fn(async () => ({collaboration:{canComment}}));
  const app = createHttpApplication({ openApi: { title: 'BP360', version: '1', enforceContracts: true, enforceResponses: true }, configure(app) {
    registerBusinessPartner360Routes(app, {
      authenticate: (_request, response, next) => { if (deny) response.status(401).json({ type: 'urn:auth', title: 'Unauthorized', status: 401 }); else next(); },
      readContext: () => ({ requestId: 'test' }) as never,
      createComment: comment,
      service: { summary, section: vi.fn(), revealTaxRegistration: vi.fn(), revealBankAccount: reveal } as never,
    });
  } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  return { url: `http://127.0.0.1:${address.port}`, reveal, comment, summary };
}
const command = { bankAccountLinkId: id, revealId: id, purpose: 'business_verification', purposeExpiresAt: '2026-09-06T12:00:00Z' };
async function post(url: string, body: unknown = command) { return fetch(`${url}/api/neon/business-partners/${id}/360/banking/reveal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
describe('Business Partner 360 registered contracts', () => {
  it('publishes all five operations with request, response and permission metadata', async () => {
    const { url } = await fixture();
    const doc = await fetch(`${url}/openapi.json`).then((r) => r.json()) as { paths: Record<string, Record<string, any>> };
    const routes = Object.entries(doc.paths).filter(([path]) => path.includes('/360/'));
    expect(routes).toHaveLength(5);
    for (const [, methods] of routes) for (const operation of Object.values(methods)) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation['x-athyper-permission']).toBeTruthy();
      expect(operation.responses['200'].content['application/json'].schema.required.length).toBeGreaterThan(0);
    }
  });
  it('validates a reveal request and response and preserves no-store', async () => {
    const { url, reveal } = await fixture();
    const response = await post(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ bankAccountLinkId: id, value: 'protected-value' });
    expect(reveal).toHaveBeenCalledOnce();
  });
  it('rejects invalid requests before invoking the protected service', async () => {
    const { url, reveal } = await fixture();
    expect((await post(url, { ...command, revealId: 'invalid' })).status).toBe(400);
    expect(reveal).not.toHaveBeenCalled();
  });
  it('does not invoke the service for denied authentication', async () => {
    const { url, reveal } = await fixture({ deny: true });
    expect((await post(url)).status).toBe(401);
    expect(reveal).not.toHaveBeenCalled();
  });
  it('preserves the service authorization problem response', async () => {
    const { url } = await fixture({ forbidden: true });
    const response = await post(url);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'BP_360_SECTION_FORBIDDEN' });
  });
  it('rejects a response which violates the shared result interface', async () => {
    const { url } = await fixture({ malformed: true });
    expect((await post(url)).status).toBe(500);
  });
});

async function commentPost(url:string, data:unknown={text:"Reviewed",idempotencyKey:id}, suffix="") { return fetch(`${url}/api/neon/business-partners/${id}/360/comments${suffix}`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)}); }
it("checks record admission and comment capability before invoking collaboration",async()=>{
 const denied=await fixture(); expect((await commentPost(denied.url)).status).toBe(403); expect(denied.comment).not.toHaveBeenCalled();
 const allowed=await fixture({canComment:true}); const response=await commentPost(allowed.url); expect(response.status).toBe(200); expect(allowed.comment).toHaveBeenCalledWith(expect.anything(),id,"Reviewed",id); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects historical comments and caller-supplied resource coordinates",async()=>{
 const allowed=await fixture({canComment:true});
 expect((await commentPost(allowed.url,{text:"Reviewed",idempotencyKey:id},"?asOf=2026-09-08")).status).toBe(409);
 expect((await commentPost(allowed.url,{text:"Reviewed",idempotencyKey:id,entityId:"other"})).status).toBe(400);
 expect(allowed.comment).not.toHaveBeenCalled();
});
