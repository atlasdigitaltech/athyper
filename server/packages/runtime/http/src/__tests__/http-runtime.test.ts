import { createServer } from "node:http";
import {
  getRequestContext,
  runWithRequestContext,
} from "@athyper/server-foundation/context";
import { HealthRegistry } from "@athyper/server-foundation/observability";
import { afterEach, describe, expect, it } from "vitest";

import { HttpError } from "../http-error.js";
import {
  createHttpApplication,
  getRequestAbortSignal,
  HttpDrainController,
} from "../http-runtime.js";
import {
  auditRouteContracts,
  createTypescriptClientContracts,
  defineRouteContract,
  registerContractRoute,
} from "../route-contract.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () =>
  Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  ),
);

describe("HTTP runtime", () => {
  it("provides liveness and dependency-aware readiness", async () => {
    const registry = new HealthRegistry();
    registry.register("database", async () => ({
      status: "unhealthy",
      message: "offline",
    }));
    const url = await listen(
      createHttpApplication({ healthRegistry: registry }),
    );
    await expect(
      fetch(`${url}/livez`).then((response) => response.status),
    ).resolves.toBe(200);
    const readiness = await fetch(`${url}/readyz`);
    expect(readiness.status).toBe(503);
    await expect(readiness.json()).resolves.toMatchObject({
      status: "unhealthy",
    });
  });

  it("publishes registered route contracts as OpenAPI 3.1", async () => {
    const url = await listen(
      createHttpApplication({
        configure(app) {
          registerContractRoute(
            app,
            defineRouteContract({
              method: "post",
              path: "/widgets/:widgetId",
              operationId: "widgets.update",
              summary: "Update widget",
              authenticated: true,
              request: {
                headers: {
                  type: "object",
                  properties: { "Idempotency-Key": { type: "string" } },
                  required: ["Idempotency-Key"],
                },
                body: { type: "object" },
              },
              responses: { 200: { description: "Updated" } },
            }),
            (_request, response) => {
              response.json({ ok: true });
            },
          );
          registerContractRoute(
            app,
            defineRouteContract({
              method: "get",
              path: "/events",
              operationId: "events.stream",
              summary: "Stream events",
              responses: {
                200: {
                  description: "Event stream",
                  body: { type: "string" },
                  contentType: "text/event-stream",
                },
              },
            }),
            (_request, response) => response.status(200).end(),
          );
        },
      }),
    );
    const document = (await fetch(`${url}/openapi.json`).then((response) =>
      response.json(),
    )) as { paths: Record<string, Record<string, unknown>> };
    expect(document.paths["/widgets/{widgetId}"]?.["post"]).toMatchObject({
      operationId: "widgets.update",
      security: [{ bearerAuth: [] }],
      requestBody: { required: true },
      responses: { 500: { description: "Internal server error" } },
      parameters: expect.arrayContaining([
        expect.objectContaining({
          name: "widgetId",
          in: "path",
          required: true,
        }),
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
          required: true,
        }),
      ]),
    });
    expect(document.paths["/events"]?.["get"]).toMatchObject({
      responses: {
        200: {
          content: { "text/event-stream": { schema: { type: "string" } } },
        },
      },
    });
  });

  it("creates request context and translates controlled errors", async () => {
    const url = await listen(
      createHttpApplication({
        configure(app) {
          app.get("/context", (_request, response) =>
            response.json(getRequestContext()),
          );
          app.get("/failure", () => {
            throw new HttpError(409, "CONFLICT", "Already exists");
          });
        },
      }),
    );
    const context = await fetch(`${url}/context`, {
      headers: { "x-request-id": "request-1" },
    });
    expect(context.headers.get("x-request-id")).toBe("request-1");
    await expect(context.json()).resolves.toMatchObject({
      requestId: "request-1",
    });
    const failure = await fetch(`${url}/failure`);
    expect(failure.status).toBe(409);
    expect(failure.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    await expect(failure.json()).resolves.toMatchObject({
      type: "urn:athyper:problem:conflict",
      title: "Conflict",
      status: 409,
      detail: "Already exists",
      instance: "/failure",
      code: "CONFLICT",
    });
  });

  it("audits raw routes and generates deterministic client operation contracts", () => {
    const app = createHttpApplication({
      openApi: false,
      configure(application) {
        application.get("/raw", (_request, response) =>
          response.sendStatus(204),
        );
      },
    });
    expect(
      auditRouteContracts(app).some(
        (issue) =>
          issue.code === "UNDOCUMENTED_ROUTE" && issue.message.includes("/raw"),
      ),
    ).toBe(true);
    expect(
      createTypescriptClientContracts({
        paths: { "/widgets": { get: { operationId: "widgets.list" } } },
      }),
    ).toContain('"widgets.list"');
  });

  it("validates executable request schemas", async () => {
    const url = await listen(
      createHttpApplication({
        configure(app) {
          registerContractRoute(
            app,
            defineRouteContract({
              method: "post",
              path: "/validated",
              operationId: "validation.create",
              summary: "Validate",
              request: {
                body: {
                  type: "object",
                  required: ["name"],
                  properties: { name: { type: "string" } },
                },
              },
              responses: { 204: { description: "Accepted" } },
            }),
            (_request, response) => response.sendStatus(204),
          );
        },
      }),
    );
    const response = await fetch(`${url}/validated`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "REQUEST_SCHEMA_INVALID",
    });
  });

  it("enforces JSON Schema 2020-12 constraints and combinators", async () => {
    const url = await listen(
      createHttpApplication({
        configure(app) {
          registerContractRoute(
            app,
            defineRouteContract({
              method: "post",
              path: "/strict-schema",
              operationId: "validation.strict",
              summary: "Strict validation",
              request: {
                body: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "score", "kind"],
                  properties: {
                    name: { type: "string", minLength: 3, pattern: "^[A-Z]" },
                    score: { type: "number", minimum: 1, maximum: 10 },
                    kind: {
                      oneOf: [{ const: "person" }, { const: "service" }],
                    },
                  },
                },
              },
              responses: { 204: { description: "Accepted" } },
            }),
            (_request, response) => response.sendStatus(204),
          );
        },
      }),
    );
    const invalidBodies = [
      { name: "Al", score: 5, kind: "person" },
      { name: "alice", score: 5, kind: "person" },
      { name: "Alice", score: 11, kind: "person" },
      { name: "Alice", score: 5, kind: "other" },
      { name: "Alice", score: 5, kind: "person", unexpected: true },
    ];
    for (const body of invalidBodies) {
      const response = await fetch(`${url}/strict-schema`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect(
      (
        await fetch(`${url}/strict-schema`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Alice", score: 5, kind: "person" }),
        })
      ).status,
    ).toBe(204);
  });

  it("validates contract header names case-insensitively", async () => {
    const url = await listen(
      createHttpApplication({
        configure(app) {
          registerContractRoute(
            app,
            defineRouteContract({
              method: "post",
              path: "/headers",
              operationId: "validation.headers",
              summary: "Validate headers",
              request: {
                headers: {
                  type: "object",
                  required: ["Idempotency-Key", "If-Match"],
                  properties: {
                    "Idempotency-Key": { type: "string" },
                    "If-Match": { type: "integer" },
                  },
                },
              },
              responses: { 204: { description: "Accepted" } },
            }),
            (_request, response) => response.sendStatus(204),
          );
        },
      }),
    );
    const response = await fetch(`${url}/headers`, {
      method: "POST",
      headers: { "idempotency-key": "request-12345678", "if-match": "2" },
    });
    expect(response.status).toBe(204);
  });

  it("enforces a bounded global rate limit while preserving health probes", async () => {
    const url = await listen(
      createHttpApplication({
        rateLimit: {
          windowMs: 60_000,
          maxRequests: 1,
          exemptPaths: ["/livez"],
        },
        configure(app) {
          app.get("/limited", (_request, response) => response.sendStatus(204));
        },
      }),
    );
    expect((await fetch(`${url}/limited`)).status).toBe(204);
    const limited = await fetch(`${url}/limited`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("ratelimit-limit")).toBe("1");
    expect((await fetch(`${url}/livez`)).status).toBe(200);
  });

  it("uses a shared rate-limit store and falls back locally when it is unavailable", async () => {
    let calls = 0;
    const failures: unknown[] = [];
    const url = await listen(
      createHttpApplication({
        rateLimit: {
          windowMs: 60_000,
          maxRequests: 1,
          store: {
            async consume() {
              calls += 1;
              if (calls === 1)
                return { count: 1, resetAt: Date.now() + 60_000 };
              throw new Error("redis unavailable");
            },
          },
          onStoreError: (error) => failures.push(error),
        },
        configure(app) {
          app.get("/limited", (_request, response) => response.sendStatus(204));
        },
      }),
    );
    expect((await fetch(`${url}/limited`)).status).toBe(204);
    expect((await fetch(`${url}/limited`)).status).toBe(204);
    expect((await fetch(`${url}/limited`)).status).toBe(429);
    expect(failures).toHaveLength(2);
  });

  it("partitions distributed limits by verified tenant and principal", async () => {
    const counts = new Map<string, number>();
    const keys: string[] = [];
    const url = await listen(
      createHttpApplication({
        rateLimit: {
          scope: "tenant-principal",
          windowMs: 60_000,
          maxRequests: 1,
          sourceMaxRequests: 100,
          store: {
            async consume(input) {
              keys.push(input.key);
              const count = (counts.get(input.key) ?? 0) + 1;
              counts.set(input.key, count);
              return { count, resetAt: input.now + input.windowMs };
            },
          },
        },
        configure(app) {
          registerContractRoute(
            app,
            defineRouteContract({
              method: "get",
              path: "/private",
              operationId: "private.read",
              summary: "Private",
              authenticated: true,
              permission: "private.read",
              responses: { 204: { description: "Accepted" } },
            }),
            (request, _response, next) =>
              runWithRequestContext(
                {
                  requestId: "verified",
                  tenantId: "tenant-1",
                  principalId: String(request.headers["x-principal"]),
                },
                next,
              ),
            (_request, response) => response.sendStatus(204),
          );
        },
      }),
    );
    expect(
      (
        await fetch(`${url}/private`, {
          headers: { "x-principal": "principal-a" },
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await fetch(`${url}/private`, {
          headers: { "x-principal": "principal-b" },
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await fetch(`${url}/private`, {
          headers: { "x-principal": "principal-a" },
        })
      ).status,
    ).toBe(429);
    expect(new Set(keys.filter((key) => key.startsWith("tenant:")))).toEqual(
      new Set([
        "tenant:tenant-1:principal:principal-a",
        "tenant:tenant-1:principal:principal-b",
      ]),
    );
  });

  it("propagates a bounded request deadline as an AbortSignal", async () => {
    const url = await listen(
      createHttpApplication({
        requestDeadlineMs: 20,
        configure(app) {
          app.get("/deadline", async (request, response) => {
            const signal = getRequestAbortSignal(request);
            await new Promise<void>((resolve) =>
              signal.addEventListener("abort", () => resolve(), { once: true }),
            );
            response.status(504).json({
              aborted: signal.aborted,
              reason:
                signal.reason instanceof Error
                  ? signal.reason.message
                  : "unknown",
            });
          });
        },
      }),
    );
    const result = await fetch(`${url}/deadline`);
    expect(result.status).toBe(504);
    await expect(result.json()).resolves.toEqual({
      aborted: true,
      reason: "HTTP request deadline exceeded",
    });
  });

  it("stops admission, drains active streams, and cancels stragglers", async () => {
    const drain = new HttpDrainController();
    const url = await listen(
      createHttpApplication({
        drainController: drain,
        configure(app) {
          app.get("/stream", (request, response) => {
            response.write("started\n");
            response.flushHeaders();
            getRequestAbortSignal(request).addEventListener(
              "abort",
              () => response.end("cancelled\n"),
              { once: true },
            );
          });
        },
      }),
    );
    const stream = await fetch(`${url}/stream`);
    expect(drain.activeRequests).toBe(1);
    drain.beginDrain();
    const rejected = await fetch(`${url}/livez`);
    expect(rejected.status).toBe(503);
    await expect(rejected.json()).resolves.toMatchObject({
      code: "SERVER_DRAINING",
    });
    await expect(drain.waitForDrain(5)).resolves.toBe(false);
    drain.abortActive();
    await expect(stream.text()).resolves.toContain("cancelled");
    await expect(drain.waitForDrain(100)).resolves.toBe(true);
  });

  it("enforces generated OpenAPI route coverage and response schemas", async () => {
    expect(() =>
      createHttpApplication({
        openApi: { title: "Strict", version: "1", enforceContracts: true },
        configure(app) {
          app.get("/raw", (_request, response) => response.sendStatus(204));
        },
      }),
    ).toThrow("Undocumented HTTP route");
    const url = await listen(
      createHttpApplication({
        openApi: { title: "Strict", version: "1", enforceResponses: true },
        configure(app) {
          registerContractRoute(
            app,
            defineRouteContract({
              method: "get",
              path: "/invalid-response",
              operationId: "response.invalid",
              summary: "Invalid",
              responses: {
                200: {
                  description: "Result",
                  body: {
                    type: "object",
                    required: ["name"],
                    properties: { name: { type: "string" } },
                  },
                },
              },
            }),
            (_request, response) => response.json({ name: 42 }),
          );
        },
      }),
    );
    const response = await fetch(`${url}/invalid-response`);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "RESPONSE_SCHEMA_INVALID",
    });
  });
});

async function listen(
  app: ReturnType<typeof createHttpApplication>,
): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}
