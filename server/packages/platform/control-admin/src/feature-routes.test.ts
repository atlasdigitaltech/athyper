import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  FeatureFlagOverride,
  FeatureFlagRepository,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation";
import {
  enforceContractResponses,
  HttpError,
} from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFeatureFlagService } from "./feature-control.js";
import {
  registerControlServiceRoutes,
  disabledControlServiceRouteFlags,
  type ControlServices,
} from "./control-service-routes.js";
const definition = {
  id: "flag-1",
  code: "ui.new",
  cohortStrategy: "principal_fnv1a_v2" as const,
  cohortRevision: 1,
  defaultEnabled: false,
  effectiveFrom: "2026-01-01T00:00:00Z",
  status: "active" as const,
};
const input = {
  enabled: true,
  reason: "Pilot",
  effectiveFrom: definition.effectiveFrom,
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
async function fixture(denied = false) {
  let current: FeatureFlagOverride | undefined;
  const repository = {
    getDefinition: vi.fn(async () => definition),
    listDefinitions: vi.fn(async () => [definition]),
    getOverride: vi.fn(async () => current),
    saveOverride: vi.fn<FeatureFlagRepository["saveOverride"]>(
      async ({ expectedVersion, ...value }) =>
        (current = {
          ...value,
          id: value.id ?? "override-1",
          version: expectedVersion + 1,
          status: "active",
        }),
    ),
    expireOverride: vi.fn<FeatureFlagRepository["expireOverride"]>(
      async (_tenant, _id, expectedVersion) =>
        (current = {
          ...current!,
          version: expectedVersion + 1,
          status: "expired",
        }),
    ),
  };
  const context = {
    tenantId: "tenant-1",
    principalId: "principal-1",
    planeKey: "neon",
  } as VerifiedRequestContext;
  const features = createFeatureFlagService({
    authorizer: {
      authorize: async () =>
        denied ? { allowed: false, reason: "denied" } : { allowed: true },
    },
    repositories: createExactPlaneRepositoryProvider({ neon: repository }),
    cache: { invalidate: async () => {} },
  });
  const app = express();
  app.use(express.json());
  enforceContractResponses(app);
  registerControlServiceRoutes(app, {
    authenticate: (req, res, next) => {
      if (req.headers["x-unauthenticated"]) {
        res.status(401).json({ code: "UNAUTHENTICATED" });
        return;
      }
      next();
    },
    readContext: () => context,
    services: { features } as ControlServices,
    flags: {
      ...disabledControlServiceRouteFlags,
      localCatalogReads: true,
      tenantOverrides: true,
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
  if (!address || typeof address === "string")
    throw new Error("Address missing");
  return {
    repository,
    request: (path: string, body?: unknown, unauthenticated = false) =>
      fetch(
        `http://127.0.0.1:${address.port}/api/control-admin/features${path}`,
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
describe("feature HTTP contracts", () => {
  it("validates array/evaluation responses and the save-update-expire lifecycle", async () => {
    const { request } = await fixture();
    const list = await request("");
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([definition]);
    expect(await (await request("/ui.new/evaluation")).json()).toMatchObject({
      enabled: false,
      source: "catalog",
    });
    const saved = await request("/ui.new/override", input);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      id: "override-1",
      version: 1,
      tenantId: "tenant-1",
    });
    expect(await (await request("/ui.new/evaluation")).json()).toMatchObject({
      enabled: true,
      source: "tenant_override",
    });
    expect(
      (
        await request("/ui.new/override", {
          ...input,
          id: "override-1",
          enabled: false,
          expectedVersion: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (await request("/overrides/override-1/expire", { expectedVersion: 2 }))
        .status,
    ).toBe(200);
    expect(await (await request("/ui.new/evaluation")).json()).toMatchObject({
      enabled: false,
      source: "catalog",
    });
  });
  it.each([
    { expectedVersion: undefined },
    { expectedVersion: 1 },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 },
    { enabled: "false" },
    { reason: " " },
    { effectiveFrom: "bad" },
    { effectiveUntil: "" },
    { effectiveUntil: null },
    { tenantId: "foreign" },
    { status: "expired" },
    { featureFlagId: "foreign" },
    { cohortStrategy: "tenant_sha256_v1" },
    { cohortRevision: 1 },
  ])("rejects malformed or forged request %j", async (value) => {
    const f = await fixture();
    expect(
      (await f.request("/ui.new/override", { ...input, ...value })).status,
    ).toBe(400);
    expect(f.repository.saveOverride).not.toHaveBeenCalled();
  });
  it.each([
    ["", undefined],
    ["/ui.new/evaluation", undefined],
    ["/ui.new/override", input],
    ["/overrides/override-1/expire", { expectedVersion: 1 }],
  ] as const)("authenticates and authorizes %s", async (path, body) => {
    const f = await fixture(true);
    expect((await f.request(path, body, true)).status).toBe(401);
    expect((await f.request(path, body)).status).toBe(403);
  });
});
