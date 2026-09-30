import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BankValidationRule } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { enforceContractResponses, HttpError } from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBankValidationService } from "./bank-validation.js";
import { disabledControlServiceRouteFlags, registerControlServiceRoutes, type ControlServices } from "./control-service-routes.js";

const rule: BankValidationRule = { id: "bank-1", version: 1, code: "DE.SEPA", countryCode: "DE", currencyCode: "EUR", railCode: "sepa", priority: 10, accountRequired: true, bankRequired: false, bicAllowed: true, bicRequired: false, branchRequired: false, checksumValidated: true, fixtures: [], status: "active" };
const input = { countryCode: "DE", currencyCode: "EUR", railCode: "sepa", accountIdentifier: "DE89370400440532013000" };
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  })));
});
async function fixture(options: { planeKey?: "studio" | "neon" | "mesh"; denied?: boolean; enabled?: boolean } = {}) {
  const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: options.planeKey ?? "studio" } as VerifiedRequestContext;
  const repository = { listApplicable: vi.fn(async () => [rule]), list: vi.fn(async () => [rule]), get: vi.fn(), publish: vi.fn(async (value: BankValidationRule) => value) };
  const bankValidation = createBankValidationService({ authorizer: { authorize: async () => options.denied ? { allowed: false, reason: "denied" } : { allowed: true } }, repositories: createExactPlaneRepositoryProvider({ studio: repository, neon: repository, mesh: repository }) });
  const app = express(); app.use(express.json()); enforceContractResponses(app);
  registerControlServiceRoutes(app, {
    authenticate: (request, response, next) => { if (request.headers["x-unauthenticated"]) { response.status(401).json({ error: "unauthenticated" }); return; } next(); },
    readContext: () => context,
    services: { bankValidation } as ControlServices,
    flags: { ...disabledControlServiceRouteFlags, localCatalogReads: options.enabled ?? true, catalogAuthoring: options.enabled ?? true },
  });
  // Match the runtime's handling: only HttpError is an intentional public error.
  app.use(((error, _request, response, _next) => response.status(error instanceof HttpError ? error.statusCode : 500).json({ code: error instanceof HttpError ? error.code : "INTERNAL_ERROR" })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  return { repository, request: (path: string, body?: unknown, unauthenticated = false) => fetch(`http://127.0.0.1:${address.port}/api/control-admin/bank-validation${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(unauthenticated ? { "x-unauthenticated": "1" } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) };
}

describe("bank-validation HTTP contracts", () => {
  it("returns a rules array with response validation enabled", async () => {
    const { request } = await fixture();
    const response = await request("/rules");
    expect(response.status).toBe(200); expect(await response.json()).toEqual([rule]);
  });
  it("returns validation issues as a successful verification response", async () => {
    const { request } = await fixture();
    const valid = await request("/verify", input);
    expect(valid.status).toBe(200); expect(await valid.json()).toEqual({ valid: true, ruleId: rule.id, issues: [] });
    const invalid = await request("/verify", { ...input, accountIdentifier: "12345", bic: "BAD" });
    expect(invalid.status).toBe(200); expect(await invalid.json()).toMatchObject({ valid: false, issues: ["BIC_INVALID", "CHECKSUM_INVALID"] });
  });
  it("publishes a rule and attributes it to the verified actor", async () => {
    const { request, repository } = await fixture();
    const response = await request("/rules/publish", rule);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(rule);
    expect(repository.publish).toHaveBeenCalledExactlyOnceWith(rule, "principal-1", "tenant-1");
  });
  it.each(["neon", "mesh"] as const)("returns 403 for publication from %s", async planeKey => {
    const { request, repository } = await fixture({ planeKey });
    expect((await request("/rules/publish", rule)).status).toBe(403);
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it.each([["/rules", undefined], ["/verify", input], ["/rules/publish", rule]] as const)("requires authentication for %s", async (path, body) => {
    const { request, repository } = await fixture();
    expect((await request(path, body, true)).status).toBe(401);
    expect(repository.list).not.toHaveBeenCalled(); expect(repository.publish).not.toHaveBeenCalled();
  });
  it.each([["/rules", undefined], ["/verify", input], ["/rules/publish", rule]] as const)("returns 403 for denied permission on %s", async (path, body) => {
    const { request, repository } = await fixture({ denied: true });
    expect((await request(path, body)).status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled(); expect(repository.publish).not.toHaveBeenCalled();
  });
  it.each([{ countryCode: "" }, { countryCode: 42 }, { railCode: " " }, { currencyCode: null }, { bic: 42 }, { accountIdentifier: "a".repeat(257) }, { tenantId: "forged" }])("rejects malformed verification input %j", async fields => {
    const { request, repository } = await fixture();
    expect((await request("/verify", { ...input, ...fields })).status).toBe(400);
    expect(repository.list).not.toHaveBeenCalled();
  });
  it.each([{ accountPattern: "[" }, { priority: -1 }, { version: 0 }, { bicAllowed: false, bicRequired: true }, { fixtures: [{ input: { ...input, countryCode: "GB" }, valid: false }] }])("returns 400 for invalid publication %j", async fields => {
    const { request, repository } = await fixture();
    expect((await request("/rules/publish", { ...rule, ...fields })).status).toBe(400);
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it("does not expose repository error details", async () => {
    const { request, repository } = await fixture();
    repository.publish.mockRejectedValue(new Error("private SQL connection details"));
    const response = await request("/rules/publish", rule);
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ code: "INTERNAL_ERROR" });
  });
  it("does not register bank routes when capability flags are disabled", async () => {
    const { request } = await fixture({ enabled: false });
    expect((await request("/rules")).status).toBe(404);
    expect((await request("/verify", input)).status).toBe(404);
    expect((await request("/rules/publish", rule)).status).toBe(404);
  });
});
