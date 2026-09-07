import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { registerRecordTransferRoutes, registerPublicRecordTransferRoutes } from "./transfer-routes.js";
import type { RecordTransferService } from "./transfer-service.js";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
describe("transfer runtime request validation", () => {
  it.each(["/api/records", "/api/v1/records"])("returns JSON 400 for invalid input on %s without invoking transfer services", async prefix => {
    const calls = vi.fn();
    const app = createHttpApplication({ openApi: { title: "Review", version: "1", enforceResponses: true }, configure(app) {
      const options = { authenticate: (_req: unknown, _res: unknown, next: () => void) => next(), readContext: () => ({}) as never, transfers: { getImport: calls, appendImportChunk: calls, listTransfers: calls, beginImport: calls } as unknown as RecordTransferService };
      registerRecordTransferRoutes(app, options); registerPublicRecordTransferRoutes(app, options);
    } });
    const server = createServer(app); servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
    const base = `http://127.0.0.1:${address.port}${prefix}`;
    for (const [path, method, body] of [["/imports/invalid", "GET", undefined], ["/transfers?limit=1&limit=2", "GET", undefined], ["/transfers?limit=0x10", "GET", undefined], ["/transfers?limit=", "GET", undefined], ["/imports/11111111-1111-4111-8111-111111111111/chunks/1e2", "PUT", { rows: [{}] }], ["/partner/imports", "POST", { operation: "invalid" }]] as const) {
      const response = await fetch(`${base}${path}`, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "INVALID_RECORD_TRANSFER_REQUEST" });
    }
    expect(calls).not.toHaveBeenCalled();
  });
});
