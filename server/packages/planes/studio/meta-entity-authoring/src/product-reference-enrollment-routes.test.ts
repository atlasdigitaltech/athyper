import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import { ProductCommandCleanupError } from "./product-command-authority.js";
const { ownership, identities, conversion } = vi.hoisted(() => ({
  ownership: vi.fn(),
  identities: vi.fn(),
  conversion: vi.fn(),
}));
vi.mock("./product-reference-enrollment.js", () => ({
  createProductReferenceEnrollment: () => ({
    initializeOwnership: ownership,
    installIdentities: identities,
    convertNative: conversion,
  }),
}));
import { registerProductReferenceEnrollmentRoutes } from "./product-reference-enrollment-routes.js";
let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  );
  server = undefined;
  vi.resetAllMocks();
});
const id = "00000000-0000-4000-8000-000000000001";
const body = {
  entityId: id,
  expectedRevision: 2,
  expectedSourceHash: "a".repeat(64),
  idempotencyKey: "reference-command-001",
};
async function fixture(native = false) {
  const app = express();
  app.use(express.json());
  const context = { principalId: id, tenantId: id } as VerifiedRequestContext;
  registerProductReferenceEnrollmentRoutes(app, {
    database: {} as never,
    authority: {} as never,
    resolvePolicies: vi.fn(),
    ...(native
      ? { nativeConversion: { resolve: vi.fn(), audit: vi.fn() } }
      : {}),
    authenticate: (req, res, next) => {
      if (!req.headers.authorization) {
        res.sendStatus(401);
        return;
      }
      next();
    },
    readContext: () => context,
  } as Parameters<typeof registerProductReferenceEnrollmentRoutes>[1]);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  return {
    context,
    send: (suffix: string, value: unknown = body, auth = true) =>
      fetch(
        `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/platform-control/meta-entity-authoring/change-sets/${id}/${suffix}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(auth ? { authorization: "Bearer fixture" } : {}),
          },
          body: JSON.stringify(value),
        },
      ),
  };
}
it("authenticates both command routes and binds exact DTO coordinates", async () => {
  const f = await fixture();
  ownership.mockResolvedValue({ revision: 3 });
  identities.mockResolvedValue({ revision: 4 });
  for (const route of ["initialize-ownership", "install-identities"]) {
    expect((await f.send(route, body, false)).status).toBe(401);
    const response = await f.send(route);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  for (const fn of [ownership, identities])
    expect(fn).toHaveBeenCalledExactlyOnceWith(f.context, {
      ...body,
      changeSetId: id,
    });
});
it("rejects actor/reviewer/source injection, query scope, overflow and oversized bodies", async () => {
  const f = await fixture();
  for (const patch of [
    { actorId: id },
    { tenantId: id },
    { reviewerId: id },
    { authoringSchemaHash: "b".repeat(64) },
    { expectedRevision: Number.MAX_SAFE_INTEGER },
    { idempotencyKey: "x" },
    { entityId: "bad" },
  ])
    expect(
      (await f.send("install-identities", { ...body, ...patch })).status,
    ).toBe(400);
  expect((await f.send("initialize-ownership?tenantId=other")).status).toBe(
    400,
  );
  expect(
    (await f.send("initialize-ownership", { ...body, extra: "x".repeat(5000) }))
      .status,
  ).toBe(413);
  expect(ownership).not.toHaveBeenCalled();
  expect(identities).not.toHaveBeenCalled();
});
it("preserves conflict, denial and committed cleanup failure distinctions", async () => {
  const f = await fixture();
  for (const [error, status] of [
    [new AuthoringConflictError("stale"), 409],
    [new AuthoringPolicyError("REVIEW_REVOKED", "revoked"), 403],
    [new ProductCommandCleanupError("committed", { revision: 3 }), 503],
  ] as const) {
    ownership.mockRejectedValueOnce(error);
    const response = await f.send("initialize-ownership");
    expect(response.status).toBe(status);
    if (status === 503)
      expect(await response.json()).toEqual({
        code: "PRODUCT_COMMAND_REVOCATION_FAILED",
        outcome: "committed",
      });
  }
});

it("keeps native conversion unregistered without an installed host binding", async () => {
  const f = await fixture();
  expect((await f.send("convert-native")).status).toBe(404);
  expect(conversion).not.toHaveBeenCalled();
});
it("authenticates native conversion and rejects request-supplied evidence", async () => {
  const f = await fixture(true);
  expect((await f.send("convert-native", body, false)).status).toBe(401);
  for (const extra of [
    { policy: {} },
    { candidate: {} },
    { schemaHash: "a".repeat(64) },
    { tenantId: id },
  ])
    expect((await f.send("convert-native", { ...body, ...extra })).status).toBe(
      400,
    );
  expect(conversion).not.toHaveBeenCalled();
  conversion.mockResolvedValue({ revision: 3 });
  expect((await f.send("convert-native")).status).toBe(200);
  expect(conversion).toHaveBeenCalledExactlyOnceWith(f.context, {
    ...body,
    changeSetId: id,
  });
});
