import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationManagementService, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { HttpError } from "@athyper/server-runtime-http";
import { registerAuthorizationManagementRoutes } from "./authorization-management-routes.js";

const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "mesh" } as VerifiedRequestContext;
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});
async function fixture() {
  const execute = vi.fn<AuthorizationManagementService["execute"]>();
  const readStatus = vi.fn<AuthorizationManagementService["readStatus"]>();
  const app = express();
  app.use(express.json());
  registerAuthorizationManagementRoutes(app, {
    authenticate: (request, response, next) => { if (request.headers["x-unauthenticated"]) { response.sendStatus(401); return; } next(); },
    readContext: () => context,
    service: { execute, readStatus },
  });
  app.use(((error, _request, response, _next) => response.status(error instanceof HttpError ? error.statusCode : 500).json({ code: error.code })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  return { execute, readStatus, request: (action: string, body?: unknown, unauthenticated = false) => fetch(`http://127.0.0.1:${address.port}/api/control-admin/authorization${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(unauthenticated ? { "x-unauthenticated": "1" } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) };
}
const command = { kind: "role.create", commandId: "command-1", idempotencyKey: "key-1", payload: {} };
describe("authorization HTTP boundary", () => {
  it.each([
    { expectedVersion: true }, { expectedVersion: "1" }, { expectedVersion: 0 }, { expectedVersion: null },
    { effectiveFrom: 123 }, { effectiveUntil: null }, { resourceId: " " }, { resourceId: [] },
    { kind: "role.destroy" }, { payload: [] },
  ])("rejects malformed fields before invoking the service: %j", async fields => {
    const { request, execute } = await fixture();
    expect((await request("/manage", { ...command, ...fields })).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(["/manage", "/approve", "/revoke", "/break-glass"])("requires authentication for %s", async action => {
    const { request, execute } = await fixture();
    expect((await request(action, command, true)).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
  it("requires authentication for status", async () => {
    const { request, readStatus } = await fixture();
    expect((await request("", undefined, true)).status).toBe(401);
    expect(readStatus).not.toHaveBeenCalled();
  });
  it.each([400, 403, 404, 409, 503])("maps authorization service errors to HTTP %s", async status => {
    const { request, execute } = await fixture();
    execute.mockRejectedValue(Object.assign(new Error("private internal detail"), { code: "AUTHZ_TEST_ERROR", status }));
    const response = await request("/manage", command);
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private internal detail");
  });
  it.each([
    ["/manage", "override.approve"], ["/manage", "override.request"], ["/manage", "role.retire"],
    ["/approve", "role.create"], ["/revoke", "role.create"], ["/break-glass", "override.approve"],
  ])("rejects command category mismatch %s %s", async (action, kind) => {
    const { request, execute } = await fixture();
    expect((await request(action, { ...command, kind })).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([
    ["/manage", "role.create"], ["/approve", "override.approve"], ["/revoke", "role.retire"], ["/break-glass", "override.request"],
  ])("passes verified context for %s", async (action, kind) => {
    const { request, execute } = await fixture();
    execute.mockResolvedValue({ mode: "legacy", writer: "legacy", rolloutRevision: "1", receipt: { commandId: "command-1", resourceId: "resource-1", version: 1, replayed: false } });
    expect((await request(action, { ...command, kind, expectedVersion: 1, context: { tenantId: "forged" } })).status).toBe(200);
    expect(execute).toHaveBeenCalledWith({ ...command, kind, expectedVersion: 1, context });
  });
});
