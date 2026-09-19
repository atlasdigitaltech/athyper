import { createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { registerRecordsRoutes, type RecordsRouteOptions } from "../records-routes.js";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
it.each([
  [{ kind: "Committed", action: "create", replayed: true }, 200],
  [{ kind: "NotFound" }, 404],
  [{ kind: "LockRequired" }, 423],
] as const)("preserves documented mutation outcome %j", async (result, status) => {
  const app = createHttpApplication({ openApi: { title: "Review", version: "1", enforceResponses: true }, configure(app) {
    registerRecordsRoutes(app, { authenticate: (_req: unknown, _res: unknown, next: () => void) => next(), readContext: () => ({}), queries: {}, mutations: { create: async () => result } } as unknown as RecordsRouteOptions);
  } });
  const server = createServer(app); servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/records/partner`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "review-request-key" }, body: "{}" });
  expect(response.status).toBe(status);
  const body = await response.json();
  if (status === 200) expect(body).toEqual(result); else expect(body).toMatchObject({ status });
});
