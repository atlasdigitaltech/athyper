import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerEntityIntakeOperationRoutes } from "./entity-intake-operation-routes.js";

const request = {
  schemaVersion: 1,
  descriptorHash: "a".repeat(64),
  flowKey: "business_partner_intake",
  operation: "save_draft",
  answers: { requestedRole: "supplier" },
};
async function fixture() {
  const app = express();
  app.use(express.json());
  const execute = vi.fn(async () => ({ schemaVersion: 1, capabilities: [{ operation: "save_draft", operationKey: "save_draft" }] }));
  registerEntityIntakeOperationRoutes(app, {
    authenticate: (_request, _response, next) => next(),
    readContext: () => ({ planeKey: "neon", tenantId: "tenant", principalId: "principal", permissions: { allowed: [] } }) as never,
    providers: { get: vi.fn(() => ({ execute })) },
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}/api/entity-runtime/business_partner/intake/business_partner_intake/operations/save_draft`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "i".repeat(16), ...headers }, body: JSON.stringify(body) });
  return { execute, post, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
describe("generic entity intake operation route", () => {
  const closes: (() => Promise<void>)[] = [];
  afterEach(async () => { await Promise.all(closes.splice(0).map(close => close())); });
  it("passes only the authenticated context, declared coordinate, request and idempotency key to the registered provider", async () => {
    const f = await fixture(); closes.push(f.close);
    const response = await f.post(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ schemaVersion: 1, capabilities: [{ operation: "save_draft" }] });
    expect(f.execute).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "i".repeat(16), request: expect.objectContaining({ answers: { requestedRole: "supplier" } }) }));
  });
  it("rejects coordinate substitution and mismatched version before the provider", async () => {
    const f = await fixture(); closes.push(f.close);
    expect((await f.post({ ...request, operation: "submit" })).status).toBe(400);
    expect((await f.post({ ...request, expectedVersion: 2 }, { "If-Match": "3" })).status).toBe(409);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("forwards an If-Match version when the body omits it", async () => {
    const f = await fixture(); closes.push(f.close);
    expect((await f.post(request, { "If-Match": "7" })).status).toBe(200);
    expect(f.execute).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({ expectedVersion: 7 }) }));
  });
  it("requires an idempotency key and fails closed without a provider", async () => {
    const f = await fixture(); closes.push(f.close);
    expect((await f.post(request, { "Idempotency-Key": "" })).status).toBe(400);
    const app = express(); app.use(express.json());
    registerEntityIntakeOperationRoutes(app, { authenticate: (_q, _s, next) => next(), readContext: () => ({}) as never, providers: { get: () => undefined } });
    const server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); closes.push(() => new Promise<void>(resolve => server.close(() => resolve())));
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/entity-runtime/business_partner/intake/business_partner_intake/operations/save_draft`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "i".repeat(16) }, body: JSON.stringify(request) });
    expect(response.status).toBe(503);
  });
});
