import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  Delivery,
  EndpointDefinition,
  IntegrationRepository,
} from "@athyper/server-contract-integration";
import { registerIntegrationRoutes } from "../integration-routes.js";
import { IntegrationService } from "../integration-service.js";
const tenantId = "11111111-1111-4111-8111-111111111111",
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const endpoint: EndpointDefinition = {
  id,
  tenantId,
  connectorInstanceId: id,
  code: "test",
  name: "test",
  kind: "health",
  path: "/health",
  method: "GET",
  requestContentType: "application/json",
  timeoutMs: 1000,
  headers: {
    Authorization: "private-token",
    "X-Api-Key": "private-key",
    accept: "application/json",
  },
  maxPayloadBytes: 1024,
  retryPolicy: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    multiplier: 2,
    retryStatuses: [500],
  },
  version: 1,
  status: "active",
};
const instance = {
  id,
  tenantId,
  connectorTypeId: id,
  code: "test",
  name: "test",
  baseUrl: "https://example.com",
  credentialReference: "secret://private",
  credentialRevision: 1,
  config: {},
  status: "active" as const,
};
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
async function setup() {
  const repository = {
    listTypes: vi.fn().mockResolvedValue([]),
    getType: vi.fn().mockResolvedValue({ id }),
    getEndpoint: vi.fn().mockResolvedValue(endpoint),
    getInstance: vi.fn().mockResolvedValue(instance),
    getDelivery: vi.fn(),
    createDelivery: vi
      .fn()
      .mockImplementation(async (input) => ({
        ...input,
        id,
        status: "pending",
        attemptCount: 0,
      })),
    prepareDlqReplay: vi
      .fn()
      .mockResolvedValue({
        kind: "prepared",
        jobId: "integration-replay-test",
        maxAttempts: 3,
      }),
  };
  const service = new IntegrationService(
    repository as unknown as IntegrationRepository,
  );
  const delivery: Delivery = {
    id,
    tenantId,
    endpointId: id,
    plan: await service.planTest(tenantId, id),
    payload: {},
    payloadHash: "hash",
    idempotencyKey: "key",
    status: "pending",
    attemptCount: 0,
  };
  repository.getDelivery.mockResolvedValue(delivery);
  const authorize = vi.fn().mockResolvedValue({ allowed: true }),
    enqueue = vi
      .fn()
      .mockImplementation(async (_q, _n, _p, options) => options.jobId),
    probe = vi
      .fn()
      .mockResolvedValue({ status: 204, headers: {}, body: new Uint8Array() }),
    resolve = vi
      .fn()
      .mockResolvedValue({ bytes: new Uint8Array(), version: "1" });
  const app = express();
  app.use(express.json({ strict: false }));
  registerIntegrationRoutes(app, {
    authenticate: (r, s, n) => {
      if (r.headers.authorization !== "Bearer test") {
        s.sendStatus(401);
        return;
      }
      n();
    },
    readContext: () =>
      ({
        tenantId,
        principalId: id,
        requestId: "request",
        correlationId: "correlation",
      }) as VerifiedRequestContext,
    authorizer: { authorize } as never,
    repository: repository as unknown as IntegrationRepository,
    service,
    jobs: { enqueue } as never,
    transport: { probe, invoke: vi.fn() },
    secrets: { resolve },
    policies: { resolve: vi.fn() },
  });
  app.use(
    (
      _e: unknown,
      _r: express.Request,
      s: express.Response,
      _n: express.NextFunction,
    ) => {
      s.status(500).json({ code: "INTERNAL_ERROR" });
    },
  );
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("address");
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    auth = "Bearer test",
  ) =>
    fetch(`http://127.0.0.1:${address.port}/api/integration/${path}`, {
      method,
      headers: { authorization: auth, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { repository, service, authorize, enqueue, probe, resolve, request };
}
const routes = [
  ["connector-types", "GET", "integration.connector_type.read"],
  [`connector-types/${id}`, "GET", "integration.connector_type.read"],
  [`connections/${id}`, "GET", "integration.connection.read"],
  [`endpoints/${id}`, "GET", "integration.endpoint.read"],
  [`deliveries/${id}`, "GET", "integration.delivery.read"],
  [`deliveries/${id}/replay`, "POST", "integration.delivery.replay"],
  [`endpoints/${id}/deliveries`, "POST", "integration.delivery.create"],
  [`connections/${id}/test`, "POST", "integration.connection.test"],
];
describe("integration API", () => {
  it.each(routes)(
    "authenticates and authorizes %s",
    async (path, method, permission) => {
      const t = await setup();
      expect((await t.request(path!, method, undefined, "")).status).toBe(401);
      expect(t.authorize).not.toHaveBeenCalled();
      t.authorize.mockResolvedValue({ allowed: false });
      expect((await t.request(path!, method)).status).toBe(403);
      expect(t.authorize).toHaveBeenCalledWith(
        expect.objectContaining({ permissionCode: permission }),
      );
      expect(t.enqueue).not.toHaveBeenCalled();
    },
  );
  it.each(["connections", "endpoints", "deliveries", "connector-types"])(
    "validates IDs and returns 404 for missing %s",
    async (resource) => {
      const t = await setup();
      expect((await t.request(`${resource}/invalid`)).status).toBe(400);
      const method = {
        connections: "getInstance",
        endpoints: "getEndpoint",
        deliveries: "getDelivery",
        "connector-types": "getType",
      }[resource]!;
      t.repository[method as "getInstance"].mockResolvedValue(undefined);
      expect((await t.request(`${resource}/${id}`)).status).toBe(404);
    },
  );
  it("scopes tenant reads to verified context and redacts credentials", async () => {
    const t = await setup();
    for (const resource of ["connections", "endpoints", "deliveries"]) {
      const response = await t.request(`${resource}/${id}?tenantId=attacker`);
      expect(response.status).toBe(200);
      const value = await response.text();
      expect(value).not.toContain("secret://private");
      expect(value).not.toContain("private-token");
      expect(value).not.toContain("private-key");
    }
    expect(t.repository.getDelivery).toHaveBeenCalledWith(tenantId, id);
    expect(t.repository.getInstance).toHaveBeenCalledWith(tenantId, id);
  });
  it("normalizes UUID case when testing a connection", async () => {
    const t = await setup();
    expect(
      (
        await t.request(`connections/${id.toUpperCase()}/test`, "POST", {
          endpointId: id,
        })
      ).status,
    ).toBe(200);
    expect(t.probe).toHaveBeenCalledTimes(1);
    t.repository.getEndpoint.mockResolvedValue({
      ...endpoint,
      connectorInstanceId: tenantId,
    });
    expect(
      (await t.request(`connections/${id}/test`, "POST", { endpointId: id }))
        .status,
    ).toBe(404);
    expect(t.probe).toHaveBeenCalledTimes(1);
  });
  it("validates category filters", async () => {
    const t = await setup();
    expect(
      (await t.request("connector-types?categoryCode=a&categoryCode=b")).status,
    ).toBe(400);
    expect(t.repository.listTypes).not.toHaveBeenCalled();
    expect(
      (await t.request("connector-types?categoryCode=%20test%20")).status,
    ).toBe(200);
    expect(t.repository.listTypes).toHaveBeenCalledWith("test");
  });
  it("creates redacted deliveries with queue-compatible deterministic IDs", async () => {
    const t = await setup();
    const response = await t.request(`endpoints/${id}/deliveries`, "POST", {
      payload: { value: 1 },
      semanticKey: "key",
      tenantId: "attacker",
    });
    expect(response.status).toBe(202);
    const value = await response.json();
    expect(value.jobId).not.toContain(":");
    expect(value.delivery.plan.credentialReference).toBeUndefined();
    expect(value.delivery.plan.headers.Authorization).toBe("[REDACTED]");
    expect(t.repository.createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId }),
      id,
    );
  });
  it.each([
    null,
    [],
    {},
    { payload: [], semanticKey: "key" },
    { payload: {}, semanticKey: 3 },
  ])("rejects invalid delivery body %j", async (body) => {
    const t = await setup();
    expect(
      (await t.request(`endpoints/${id}/deliveries`, "POST", body)).status,
    ).toBe(400);
    expect(t.enqueue).not.toHaveBeenCalled();
  });
  it("reports schema and size errors without publishing jobs", async () => {
    const t = await setup();
    t.repository.getEndpoint.mockResolvedValue({
      ...endpoint,
      requestSchema: {
        type: "object",
        properties: {
          nested: {
            type: "object",
            required: ["code"],
            properties: { code: { enum: ["valid"] } },
          },
        },
        required: ["nested"],
        additionalProperties: false,
      },
    });
    for (const payload of [
      {},
      { nested: {} },
      { nested: { code: "wrong" } },
      { nested: { code: "valid" }, extra: true },
    ]) {
      expect(
        (
          await t.request(`endpoints/${id}/deliveries`, "POST", {
            payload,
            semanticKey: "key",
          })
        ).status,
      ).toBe(422);
    }
    t.repository.getEndpoint.mockResolvedValue({
      ...endpoint,
      maxPayloadBytes: 1,
    });
    expect(
      (
        await t.request(`endpoints/${id}/deliveries`, "POST", {
          payload: {},
          semanticKey: "key",
        })
      ).status,
    ).toBe(413);
    expect(t.enqueue).not.toHaveBeenCalled();
  });
  it("reports unavailable endpoints and unsafe test operations", async () => {
    const t = await setup();
    t.repository.getEndpoint.mockResolvedValue({
      ...endpoint,
      status: "suspended",
    });
    expect(
      (
        await t.request(`endpoints/${id}/deliveries`, "POST", {
          payload: {},
          semanticKey: "key",
        })
      ).status,
    ).toBe(409);
    t.repository.getEndpoint.mockResolvedValue({
      ...endpoint,
      kind: "delivery",
      method: "POST",
    });
    expect(
      (await t.request(`connections/${id}/test`, "POST", { endpointId: id }))
        .status,
    ).toBe(422);
    expect(t.probe).not.toHaveBeenCalled();
  });
  it("passes replay identity and reuses its queue ID", async () => {
    const t = await setup();
    expect((await t.request(`deliveries/${id}/replay`, "POST")).status).toBe(
      202,
    );
    expect(t.repository.prepareDlqReplay).toHaveBeenCalledWith({
      tenantId,
      deliveryId: id,
      principalId: id,
      requestId: "request",
      correlationId: "correlation",
    });
    expect(t.enqueue).toHaveBeenCalledWith(
      "integration.delivery",
      "integration.deliver",
      { tenantId, deliveryId: id },
      expect.objectContaining({
        jobId: "integration-replay-test",
        maxAttempts: 3,
      }),
    );
  });
});
