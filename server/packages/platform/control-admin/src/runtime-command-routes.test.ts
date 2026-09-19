import { describe, expect, it, vi } from "vitest";
import { registerRuntimeCommandRoutes } from "./runtime-command-routes.js";

describe("runtime command route composition", () => {
  it("registers dry-run, submission, approval, and immutable-history endpoints", () => {
    const routes: string[] = [];
    const application = {
      get: vi.fn((path: string) => {
        routes.push(`GET ${path}`);
      }),
      post: vi.fn((path: string) => {
        routes.push(`POST ${path}`);
      }),
    };
    registerRuntimeCommandRoutes(application as never, {
      authenticate: vi.fn() as never,
      readContext: vi.fn() as never,
      service: {} as never,
    });
    expect(routes).toEqual([
      "POST /api/control-admin/runtime-commands/dry-run",
      "POST /api/control-admin/runtime-commands",
      "POST /api/control-admin/runtime-approvals/:id/decisions",
      "GET /api/control-admin/runtime-history",
    ]);
  });
});

import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import { afterEach } from "vitest";
import {
  HttpError,
  enforceContractResponses,
} from "@athyper/server-runtime-http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createRuntimeCommandService,
  InMemoryRuntimeCommandStore,
} from "./runtime-command-service.js";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
          s.closeAllConnections();
        }),
    ),
  );
});
async function httpFixture() {
  const apply = vi.fn(async () => ({ enabled: true }));
  const service = createRuntimeCommandService({
    store: new InMemoryRuntimeCommandStore(),
    authorizer: { authorize: async () => ({ allowed: true }) },
    executor: {
      effects: "transactional",
      preview: async () => ({
        current: { enabled: false },
        proposed: { enabled: true },
        risk: "high",
      }),
      apply,
    },
  });
  const app = express();
  app.use(express.json());
  enforceContractResponses(app);
  registerRuntimeCommandRoutes(app, {
    service,
    authenticate: (req, res, next) => {
      if (!req.headers["x-actor"]) {
        res.sendStatus(401);
        return;
      }
      res.locals["actor"] = req.headers["x-actor"];
      next();
    },
    readContext: (res) =>
      ({
        tenantId: "tenant",
        principalId: res.locals["actor"],
        planeKey: "neon",
      }) as VerifiedRequestContext,
  });
  app.use(((e, _r, res, _n) =>
    res
      .status(e instanceof HttpError ? e.statusCode : 500)
      .json({ code: e.code })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const a = server.address();
  if (!a || typeof a === "string") throw Error("address");
  return {
    apply,
    call: (path: string, body?: unknown, actor = "requester") =>
      fetch(`http://127.0.0.1:${a.port}/api/control-admin${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          ...(actor ? { "x-actor": actor } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}
const httpCommand = {
  commandId: "cmd",
  idempotencyKey: "key",
  kind: "feature.activate",
  reason: "Reviewed change",
  payload: { enabled: true },
};
it("exercises preview, 202 approval, separate review, requester execution and typed history", async () => {
  const f = await httpFixture();
  expect((await f.call("/runtime-history", undefined, "")).status).toBe(401);
  const preview = await f.call("/runtime-commands/dry-run", httpCommand);
  expect(preview.status).toBe(200);
  expect((await preview.json()).approvalRequired).toBe(true);
  const pending = await f.call("/runtime-commands", httpCommand);
  expect(pending.status).toBe(202);
  const { approval } = await pending.json();
  expect(approval).not.toHaveProperty("tenantId");
  expect(
    (
      await f.call(`/runtime-approvals/${approval.approvalId}/decisions`, {
        decision: "approved",
        reason: "Reviewed",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.call(
        `/runtime-approvals/${approval.approvalId}/decisions`,
        { decision: "approved", reason: "Reviewed" },
        "reviewer",
      )
    ).status,
  ).toBe(200);
  expect(f.apply).not.toHaveBeenCalled();
  const applied = await f.call("/runtime-commands", {
    ...httpCommand,
    approvalId: approval.approvalId,
  });
  expect(applied.status).toBe(200);
  expect((await applied.json()).outcome).toBe("applied");
  const history = await f.call("/runtime-history?limit=200");
  expect(history.status).toBe(200);
  expect((await history.json()).map((x: { event: string }) => x.event)).toEqual(
    ["applied", "approved", "approval_requested", "submitted"],
  );
});
it.each(["0", "201", "1e2", "1.5", "01", "-1", "10&limit=20"])(
  "rejects noncanonical history limit %s",
  async (limit) => {
    expect(
      (await (await httpFixture()).call("/runtime-history?limit=" + limit))
        .status,
    ).toBe(400);
  },
);
it.each([
  { ...httpCommand, approvalId: 42 },
  { ...httpCommand, expectedVersion: "1" },
  { ...httpCommand, reason: "" },
  { ...httpCommand, payload: [] },
  { ...httpCommand, extra: true },
])("rejects malformed command contract %j", async (body) => {
  const f = await httpFixture();
  expect((await f.call("/runtime-commands", body)).status).toBe(400);
  expect(f.apply).not.toHaveBeenCalled();
});

it("waits for the transaction and replays concurrent approved execution", async () => {
  const f = await httpFixture();
  const pending = await (await f.call("/runtime-commands", httpCommand)).json();
  const approvalId = pending.approval.approvalId;
  await f.call(
    `/runtime-approvals/${approvalId}/decisions`,
    { decision: "approved", reason: "Reviewed" },
    "reviewer",
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.apply.mockImplementationOnce(async () => {
    await gate;
    return { enabled: true };
  });
  const first = f.call("/runtime-commands", { ...httpCommand, approvalId });
  try {
    await vi.waitFor(() => expect(f.apply).toHaveBeenCalledOnce());
    const concurrentRequest = f.call("/runtime-commands", {
      ...httpCommand,
      approvalId,
    });
    release();
    const concurrent = await concurrentRequest;
    expect(concurrent.status).toBe(200);
    expect((await concurrent.json()).outcome).toBe("replayed");
  } finally {
    release();
    await first;
  }
});
