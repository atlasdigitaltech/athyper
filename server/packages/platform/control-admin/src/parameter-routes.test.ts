import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  ParameterDefinition,
  ParameterRepository,
  TenantParameterValue,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import {
  HttpError,
  enforceContractResponses,
} from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createParameterService } from "./parameter-control.js";
import {
  registerControlServiceRoutes,
  disabledControlServiceRouteFlags,
  type ControlServices,
} from "./control-service-routes.js";
const definition: ParameterDefinition = {
  revision: 1,
  id: "p1",
  code: "ui.setting",
  valueType: "json",
  defaultValue: "default",
  tenantCanOverride: true,
  reloadMode: "next_request",
  cacheTtlSeconds: 300,
  status: "active",
};
const input = {
  value: null,
  effectiveFrom: "2026-01-01T00:00:00Z",
  expectedVersion: 0,
};
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((e) => (e ? reject(e) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});
async function fixture(denied = false, enabled = true) {
  const context = {
    tenantId: "tenant-1",
    principalId: "actor-1",
    planeKey: "neon",
  } as VerifiedRequestContext;
  let current: TenantParameterValue | undefined;
  const repo = {
    getDefinition: vi.fn(async () => definition),
    listDefinitions: vi.fn(async () => [definition]),
    getValue: vi.fn(async () => current),
    saveValue: vi.fn<ParameterRepository["saveValue"]>(
      async ({ expectedVersion, ...value }) =>
        (current = {
          ...value,
          id: value.id ?? "v1",
          version: expectedVersion + 1,
          status: "active",
        }),
    ),
    expireValue: vi.fn<ParameterRepository["expireValue"]>(async () => ({
      ...current!,
      status: "expired",
      version: 2,
    })),
  };
  const parameters = createParameterService({
    authorizer: {
      authorize: async () =>
        denied ? { allowed: false, reason: "denied" } : { allowed: true },
    },
    repositories: createExactPlaneRepositoryProvider({ neon: repo }),
    cache: { invalidate: async () => {} },
    now: () => new Date("2026-06-01T00:00:00Z"),
  });
  const app = express();
  app.use(express.json());
  enforceContractResponses(app);
  registerControlServiceRoutes(app, {
    authenticate: (req, res, next) => {
      if (req.headers["x-unauthenticated"]) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      next();
    },
    readContext: () => context,
    services: { parameters } as ControlServices,
    flags: {
      ...disabledControlServiceRouteFlags,
      localCatalogReads: enabled,
      tenantOverrides: enabled,
    },
  });
  app.use(((error, _req, res, _next) =>
    res.status(error instanceof HttpError ? error.statusCode : 500).json({
      code: error instanceof HttpError ? error.code : "INTERNAL_ERROR",
    })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("address");
  return {
    repo,
    request: (path: string, body?: unknown, unauthenticated = false) =>
      fetch(
        `http://127.0.0.1:${address.port}/api/control-admin/parameters${path}`,
        {
          method:
            body === undefined
              ? "GET"
              : path.endsWith("/expire")
                ? "POST"
                : "PUT",
          headers: {
            "content-type": "application/json",
            ...(unauthenticated ? { "x-unauthenticated": "1" } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      ),
  };
}
describe("parameter HTTP contracts", () => {
  it("returns repository version conflicts as HTTP 409", async () => {
    const f = await fixture();
    f.repo.saveValue.mockRejectedValue(
      new HttpError(409, "CONTROL_ADMIN_VERSION_CONFLICT", "Stale version"),
    );
    expect(
      (
        await f.request("/ui.setting/value", {
          ...input,
          id: "v1",
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    f.repo.expireValue.mockRejectedValue(
      new HttpError(409, "CONTROL_ADMIN_VERSION_CONFLICT", "Stale version"),
    );
    expect(
      (await f.request("/values/v1/expire", { expectedVersion: 1 })).status,
    ).toBe(409);
  });

  it("returns typed definitions and preserves null in save/effective responses", async () => {
    const f = await fixture();
    const list = await f.request("");
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([definition]);
    expect(
      await (await f.request("/ui.setting/effective")).json(),
    ).toMatchObject({ value: "default", source: "default" });
    expect((await f.request("/ui.setting/value", input)).status).toBe(200);
    expect(
      await (await f.request("/ui.setting/effective")).json(),
    ).toMatchObject({ value: null, source: "tenant_override" });
    expect(f.repo.saveValue).toHaveBeenCalledWith(
      { ...input, tenantId: "tenant-1", parameterDefinitionId: "p1" },
      "actor-1",
    );
    expect(
      (await f.request("/values/v1/expire", { expectedVersion: 1 })).status,
    ).toBe(200);
  });
  it.each([
    { value: undefined },
    { expectedVersion: undefined },
    { expectedVersion: "0" },
    { expectedVersion: 0.5 },
    { expectedVersion: 1 },
    { expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { effectiveFrom: "bad" },
    { effectiveUntil: "" },
    { effectiveUntil: null },
    { effectiveUntil: input.effectiveFrom },
    { reason: " " },
    { reason: 42 },
    { id: null },
    { tenantId: "forged" },
    { parameterDefinitionId: "forged" },
  ])("rejects malformed save %j", async (fields) => {
    const f = await fixture();
    expect(
      (await f.request("/ui.setting/value", { ...input, ...fields })).status,
    ).toBe(400);
    expect(f.repo.saveValue).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { expectedVersion: 0 },
    { expectedVersion: "1" },
    { expectedVersion: 1, tenantId: "forged" },
  ])("requires a positive expiration version %j", async (body) => {
    const f = await fixture();
    expect((await f.request("/values/v1/expire", body)).status).toBe(400);
    expect(f.repo.expireValue).not.toHaveBeenCalled();
  });
  it.each([
    ["", undefined],
    ["/ui.setting/effective", undefined],
    ["/ui.setting/value", input],
    ["/values/v1/expire", { expectedVersion: 1 }],
  ] as const)("authenticates and authorizes %s", async (path, body) => {
    const f = await fixture(true);
    expect((await f.request(path, body, true)).status).toBe(401);
    expect((await f.request(path, body)).status).toBe(403);
    expect(f.repo.getDefinition).not.toHaveBeenCalled();
    expect(f.repo.saveValue).not.toHaveBeenCalled();
  });
  it("does not register disabled routes", async () => {
    const f = await fixture(false, false);
    expect((await f.request("")).status).toBe(404);
    expect((await f.request("/ui.setting/value", input)).status).toBe(404);
  });
});
