import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type ErrorRequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enforceContractResponses,
  routeContracts,
} from "@athyper/server-runtime-http";
import { context } from "./review-fixture.js";
import { registerAtlasRoutes } from "../atlas-routes.js";
import { registerAtlasAdminRoutes } from "../atlas-admin-routes.js";
import { AtlasServiceError } from "../errors.js";
import { hasPermission } from "../context.js";

const id = "10000000-0000-4000-8000-000000000003";
const servers: ReturnType<express.Application["listen"]>[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});
const ok = () => vi.fn(async (..._args: unknown[]) => ({}));
async function harness(withRuntime = true) {
  const app = express();
  app.use(express.json());
  enforceContractResponses(app);
  const threads = {
    create: ok(),
    list: ok(),
    get: vi.fn(async () => ({ status: "active" })),
    messages: ok(),
    rename: ok(),
    archive: ok(),
    delete: ok(),
    export: ok(),
    putParticipant: ok(),
    revokeParticipant: ok(),
  };
  const tools = { history: ok(), preview: ok(), cancel: ok(), run: ok() };
  const runs = {
    get: vi.fn(async () => ({
      tenantId: context.tenantId,
      planeKey: context.planeKey,
      principalId: context.principalId,
      threadId: id,
    })),
  };
  const admin = {
    credentials: { createOrRotate: ok(), revoke: vi.fn(async () => null) },
    knowledge: { registerSource: ok(), retract: ok() },
    policies: { putActionPolicy: ok(), putConfidenceThreshold: ok() },
    quotas: { snapshot: ok(), putPolicy: ok() },
    dashboards: { calibration: ok(), drift: ok() },
  };
  const authenticate = vi.fn((_req, _res, next) => next());
  const authorize = vi.fn(async () => true);
  registerAtlasRoutes(app, {
    authenticate,
    readContext: () => context,
    threads: threads as never,
    tools: tools as never,
    runs: runs as never,
    admission: { resolve: ok() } as never,
    runtime: withRuntime ? {
      async *run() {
        yield {
          protocol: "atlas.sse/1",
          sequence: 1,
          runId: id,
          threadId: id,
          emittedAt: new Date().toISOString(),
          event: { type: "run.cancelled" },
        };
      },
    } as never : undefined,
  });
  registerAtlasAdminRoutes(app, {
    authenticate,
    readContext: () => context,
    authorize,
    ...(admin as never as Omit<
      Parameters<typeof registerAtlasAdminRoutes>[1],
      "authenticate" | "readContext" | "authorize"
    >),
  });
  app.use(((error, _req, res, _next) =>
    res
      .status(error.status ?? error.statusCode ?? 500)
      .json({ code: error.code ?? "INTERNAL_ERROR" })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
  const request = (method: string, path: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  return { request, threads, tools, runs, admin, authorize, authenticate, app };
}
const preview = {
  threadId: id,
  runId: id,
  callId: "call",
  toolCode: "read",
  toolVersion: "1",
  arguments: {},
  summary: "Read",
};
const policy = {
  actionCode: "invoice.post",
  autonomyLevel: "assist",
  requiresHumanConfirmation: true,
  docClass: null,
  minConfidenceForAuto: null,
};
const threshold = {
  actionCode: "invoice.post",
  docClass: null,
  modelId: null,
  minForSuggest: 0.3,
  minForAssist: 0.6,
  minForAuto: 0.9,
  driftAlertBelow: null,
  driftWindowHours: 24,
};
const quota = {
  maxRequests: 10,
  maxInputTokens: 100,
  maxOutputTokens: 100,
  windowSeconds: 60,
};
const routes: [string, string, unknown?, number?][] = [
  ["GET", "/api/atlas/admission"],
  ["GET", "/api/atlas/threads"],
  ["POST", "/api/atlas/threads", {}, 201],
  ["GET", `/api/atlas/threads/${id}`],
  ["DELETE", `/api/atlas/threads/${id}`, { expectedRowVersion: 1 }, 204],
  [
    "PATCH",
    `/api/atlas/threads/${id}`,
    { title: "Renamed", expectedRowVersion: 1 },
  ],
  ["POST", `/api/atlas/threads/${id}/archive`, { expectedRowVersion: 1 }],
  ["GET", `/api/atlas/threads/${id}/export`],
  ["GET", `/api/atlas/threads/${id}/messages`],
  [
    "PUT",
    `/api/atlas/threads/${id}/participants/${id}`,
    { role: "member", expectedRowVersion: 1 },
  ],
  [
    "DELETE",
    `/api/atlas/threads/${id}/participants/${id}`,
    { expectedRowVersion: 1 },
  ],
  [
    "POST",
    `/api/atlas/threads/${id}/runs`,
    {
      clientRequestId: "r",
      publicModelId: "atlas-fast",
      dataClass: "internal",
      userText: "Hello",
      catalogPolicyRevision: "1",
    },
  ],
  ["GET", "/api/atlas/tools/history"],
  ["POST", "/api/atlas/tools/preview", preview],
  ["POST", `/api/atlas/tools/${id}/cancel`, {}],
  ["POST", `/api/atlas/tools/${id}/run`, { arguments: {} }],
  ["PUT", "/api/admin/atlas/credentials/openai", { secret: "secret" }],
  ["DELETE", "/api/admin/atlas/credentials/openai"],
  [
    "POST",
    "/api/admin/atlas/knowledge/sources",
    {
      sourceKind: "document",
      sourceId: "doc",
      permissionCode: "documents.read",
    },
  ],
  ["POST", "/api/admin/atlas/knowledge/sources/retract", { sourceId: "doc" }],
  ["PUT", "/api/admin/atlas/action-policies", policy],
  ["PUT", "/api/admin/atlas/confidence-thresholds", threshold],
  ["GET", "/api/admin/atlas/quota"],
  ["PUT", "/api/admin/atlas/quota", quota],
  ["GET", "/api/admin/atlas/monitoring/calibration"],
  ["GET", "/api/admin/atlas/monitoring/drift"],
];
describe("Atlas route review", () => {
  it.each(routes)(
    "serves %s %s with contract response enforcement",
    async (method, path, body, status = 200) => {
      const h = await harness();
      const response = await h.request(method, path, body);
      expect(response.status).toBe(status);
      await response.text();
      expect(h.authenticate).toHaveBeenCalledOnce();
      expect(routeContracts(h.app)).toHaveLength(26);
      expect(
        new Set(routeContracts(h.app).map((r) => `${r.method} ${r.path}`)).size,
      ).toBe(26);
    },
  );
  it.each(routes.filter(([, path]) => path.startsWith("/api/admin/")))(
    "denies non-admin %s %s",
    async (method, path, body) => {
      const h = await harness();
      h.authorize.mockResolvedValue(false);
      const response = await h.request(method, path, body);
      expect(response.status).toBe(403);
      await response.text();
      for (const service of Object.values(h.admin))
        for (const method of Object.values(service))
          expect(method).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["PUT", "/api/admin/atlas/credentials/invalid", { secret: "secret" }],
    ["PUT", "/api/admin/atlas/credentials/openai", { secret: " " }],
    ["PUT", "/api/admin/atlas/quota", { ...quota, maxRequests: 1.5 }],
    ["GET", "/api/admin/atlas/monitoring/drift?windowHours=0", undefined],
    ["GET", "/api/atlas/threads?status=deleted", undefined],
    ["GET", "/api/atlas/threads?limit=1&limit=2", undefined],
    [
      "PATCH",
      `/api/atlas/threads/${id}`,
      { title: "Title", expectedRowVersion: null },
    ],
    [
      "PATCH",
      `/api/atlas/threads/${id}`,
      { title: "Title", expectedRowVersion: false },
    ],
    [
      "PATCH",
      `/api/atlas/threads/${id}`,
      { title: "Title", expectedRowVersion: "" },
    ],
    ["POST", "/api/atlas/threads", { title: 42 }],
    ["POST", "/api/atlas/tools/preview", { ...preview, runId: "not-a-uuid" }],
  ] as [string, string, unknown][])(
    "rejects malformed %s %s as 400",
    async (method, path, body) => {
      const h = await harness();
      const response = await h.request(method, path, body);
      expect(response.status).toBe(400);
      await response.text();
      expect(h.tools.preview).not.toHaveBeenCalled();
    },
  );
  it("maps policy service conflicts to 409", async () => {
    const h = await harness();
    h.admin.policies.putActionPolicy.mockRejectedValue(
      new AtlasServiceError("VERSION_CONFLICT", "Stale policy"),
    );
    const response = await h.request(
      "PUT",
      "/api/admin/atlas/action-policies",
      policy,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it.each(["tenantId", "planeKey", "principalId", "threadId"] as const)(
    "rejects mismatched preview %s before storing a proposal",
    async (key) => {
      const h = await harness();
      h.runs.get.mockResolvedValue({
        tenantId: context.tenantId,
        planeKey: context.planeKey,
        principalId: context.principalId,
        threadId: id,
        [key]: "other",
      } as never);
      const response = await h.request(
        "POST",
        "/api/atlas/tools/preview",
        preview,
      );
      expect(response.status).toBe(403);
      await response.text();
      expect(h.tools.preview).not.toHaveBeenCalled();
    },
  );
  it.each(["denied", "planLocked", "planeExcluded"] as const)(
    "does not grant an allowed admin permission when %s",
    (key) => {
      expect(
        hasPermission(
          {
            ...context,
            permissions: {
              ...context.permissions,
              [key]: ["atlas.admin.manage"],
            },
          },
          "atlas.admin.manage",
        ),
      ).toBe(false);
    },
  );
});


it("keeps history available and returns an explicit 503 when inference is not configured", async () => {
  const h = await harness(false);
  h.threads.list.mockResolvedValue({ items: [], nextCursor: null });
  const history = await h.request("GET", "/api/atlas/threads");
  expect(history.status).toBe(200);
  expect(await history.json()).toEqual({ items: [], nextCursor: null });
  const run = await h.request("POST", `/api/atlas/threads/${id}/runs`, {
    clientRequestId: "r", publicModelId: "atlas-fast", dataClass: "internal", userText: "hello", catalogPolicyRevision: "1",
  });
  expect(run.status).toBe(503);
  expect(await run.json()).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
});
