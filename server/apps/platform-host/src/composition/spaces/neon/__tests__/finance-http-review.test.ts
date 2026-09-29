import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  financeEntryPoints,
  financeSliceOrder,
  registerFinanceHttpRoutes,
  type NeonFinanceRegistration,
} from "@athyper/server-plane-neon";
import {
  createHttpApplication,
  createOpenApiDocument,
  HttpError,
  routeContracts,
} from "@athyper/server-runtime-http";
import {
  financeRouteContracts,
  registerFinanceRoutes,
} from "../finance-routes.js";

const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const envelope = {
  commandId: uuid,
  commandCode: "finance.test",
  idempotencyKey: "key",
  requestFingerprint: "hash",
  payload: {},
};
const descriptors = Object.values(financeEntryPoints)
  .flat()
  .filter((p) => p.kind === "route");
const allRoutes = [
  ...Object.values(financeRouteContracts).map((p) => ({
    method: p.method,
    path: p.path,
    code: p.operationId,
    permission: p.permission,
  })),
  ...descriptors,
];
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

async function setup(
  options: { plane?: string; permissions?: string[]; enabled?: boolean } = {},
) {
  const invoke = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
  const services = {
    f2: {
      budget: { mutate: invoke },
      balances: { reconcile: invoke, rebuild: invoke },
      planningRuns: { create: invoke, transition: invoke },
      planningOutputs: { list: invoke },
    },
    f3: {
      gl: { post: invoke },
      reconciliation: { reconcile: invoke },
      crossBook: { schedule: invoke },
      commitments: { fulfill: invoke },
    },
    f4: {
      movements: {
        receipt: invoke,
        issue: invoke,
        transfer: invoke,
        reverse: invoke,
      },
      queries: { balance: invoke },
    },
    f5: {
      calculations: { calculate: invoke },
      credits: { move: invoke, balance: invoke, rebuild: invoke },
    },
    f6: { readiness: { query: invoke } },
  };
  const enqueue = vi.fn(async (..._args: unknown[]) => "job-1");
  const finance = {
    executionPlane: "neon",
    flags: {},
    slices: Object.fromEntries(
      financeSliceOrder.map((slice) => [
        slice,
        {
          enabled: options.enabled ?? true,
          entryPoints: financeEntryPoints[slice],
          services: services[slice],
          readiness: async () => ({ status: "healthy" }),
        },
      ]),
    ),
    enqueue,
    executeWorker: vi.fn(),
  } as unknown as NeonFinanceRegistration;
  const context = {
    tenantId: uuid,
    principalId: uuid,
    planeKey: options.plane ?? "neon",
    requestId: "request-1",
    permissions: {
      allowed: options.permissions ?? [
        ...allRoutes.map((p) => p.permission!),
        "finance.planning.approve",
      ],
      denied: [],
    },
  } as unknown as VerifiedRequestContext;
  const app = createHttpApplication({
    openApi: {
      title: "Finance",
      version: "1",
      enforceContracts: true,
      enforceResponses: true,
    },
    configure(application) {
      const common = {
        authenticate: ((
          _req: unknown,
          res: { status: (s: number) => { end: () => void } },
          next: () => void,
        ) => next()) as never,
        readContext: () => context,
      };
      // Authentication can fail independently of the immutable context fixture.
      common.authenticate = ((
        req: { headers: Record<string, string> },
        res: { status: (s: number) => { end: () => void } },
        next: () => void,
      ) => {
        if (req.headers["authorization"] !== "Bearer test") {
          res.status(401).end();
          return;
        }
        next();
      }) as never;
      if (options.enabled !== false)
        registerFinanceRoutes(application, {
          ...common,
          periods: { transition: invoke } as never,
          rounding: { resolve: invoke } as never,
          postingGuard: { admit: invoke } as never,
          numbering: { allocate: invoke, reconcile: invoke } as never,
        });
      registerFinanceHttpRoutes(application, { ...common, finance });
    },
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const request = (
    path: string,
    method = "post",
    body: unknown = {},
    headers: Record<string, string> = {},
  ) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: {
        authorization: "Bearer test",
        "content-type": "application/json",
        ...headers,
      },
      ...(method === "get" ? {} : { body: JSON.stringify(body) }),
    });
  return { app, invoke, enqueue, request, finance };
}

function input(code: string): Record<string, unknown> {
  if (code === "finance.bookPeriods.transition")
    return { companyCodeId: uuid, targetStatus: "open" };
  if (code === "finance.rounding.resolve")
    return { companyCodeId: uuid, currencyCode: "USD", slot: "UNIT_PRICE" };
  if (code === "finance.postingAdmissions.create")
    return {
      permissionCode: "finance.ledger.post",
      coordinates: {
        companyCodeId: uuid,
        ledgerBookId: uuid,
        fiscalPeriodId: uuid,
        currencyCode: "USD",
      },
      roundingSlot: "UNIT_PRICE",
      source: {
        sourceType: "invoice",
        sourceId: uuid,
        version: 1,
        hash: "a".repeat(64),
      },
    };
  if (code === "finance.numbering.allocations.create")
    return {
      commandId: uuid,
      idempotencyKey: "key",
      occurredAt: "2026-09-07T00:00:00Z",
      companyCodeId: uuid,
      ledgerBookId: uuid,
      fiscalPeriodId: uuid,
      documentId: uuid,
      documentType: "invoice",
      jurisdictionCode: "US",
      transactionCurrencyCode: "USD",
      baseCurrencyCode: "USD",
    };
  if (code === "finance.planning.run")
    return { run: { id: uuid }, outputs: [] };
  if (code === "finance.inventory.rebuild")
    return {
      coordinate: {
        companyCodeId: uuid,
        itemId: uuid,
        warehouseId: uuid,
        uomCode: "EA",
        currencyCode: "USD",
      },
    };
  if (code === "finance.budget.reverse")
    return {
      ...envelope,
      payload: { transactionType: "reverse", reversalOfTransactionId: uuid },
    };
  if (code === "finance.commitment.reverse")
    return { ...envelope, payload: { reversesFulfillmentId: uuid } };
  if (code === "finance.tax.reverse")
    return { ...envelope, payload: { reversesCalculationIds: [uuid] } };
  if (code.startsWith("finance.close."))
    return {
      ...envelope,
      kind: "asset",
      payload:
        code === "finance.close.reverse" ? { reversesReserveId: uuid } : {},
    };
  return { ...envelope, operation: "receipt", asOf: "2026-09-07" };
}
function pathFor(route: (typeof allRoutes)[number]) {
  const path = route.path!.replace(/:[A-Za-z]+/g, uuid);
  return route.method === "get"
    ? `${path}?policyId=${uuid}&policyRevision=1&asOf=2026-09-07&fiscalYear=2026&periodNumber=9`
    : path;
}

describe("canonical finance HTTP surface", () => {
  it("publishes all 29 unique canonical operations with authentication and permission metadata", async () => {
    const { app } = await setup();
    const routes = routeContracts(app).filter((p) =>
      p.operationId.startsWith("finance."),
    );
    expect(routes).toHaveLength(29);
    expect(new Set(routes.map((p) => p.operationId)).size).toBe(29);
    for (const route of routes) {
      expect(route.path).toMatch(/^\/api\/neon\/finance\//);
      expect(route.authenticated).toBe(true);
      expect(route.permission).toMatch(/^finance\./);
    }
    const document = createOpenApiDocument(app, {
      title: "Finance",
      version: "1",
    });
    expect(JSON.stringify(document)).not.toContain('"/api/finance/');
  });
  it.each(allRoutes)(
    "executes $code through contract validation",
    async (route) => {
      const { request, invoke, enqueue } = await setup();
      const response = await request(
        pathFor(route),
        route.method!,
        input(route.code!),
        { "if-match": '"1"' },
      );
      expect([200, 202]).toContain(response.status);
      expect(await response.json()).toBeTruthy();
      expect(
        invoke.mock.calls.length + enqueue.mock.calls.length,
      ).toBeGreaterThan(0);
    },
  );
  it.each(allRoutes)("rejects unauthenticated $code", async (route) => {
    const { request, invoke, enqueue } = await setup();
    expect(
      (
        await request(pathFor(route), route.method!, input(route.code!), {
          authorization: "",
          "if-match": "1",
        })
      ).status,
    ).toBe(401);
    expect(invoke).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
  it.each(allRoutes)(
    "rejects missing permission for $code before side effects",
    async (route) => {
      const { request, invoke, enqueue } = await setup({ permissions: [] });
      expect(
        (
          await request(pathFor(route), route.method!, input(route.code!), {
            "if-match": "1",
          })
        ).status,
      ).toBe(403);
      expect(invoke).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    },
  );
  it.each(["mesh", "studio"])(
    "rejects %s context across all 29 routes",
    async (plane) => {
      const { request, invoke, enqueue } = await setup({ plane });
      for (const route of allRoutes)
        expect(
          (
            await request(pathFor(route), route.method!, input(route.code!), {
              "if-match": "1",
            })
          ).status,
        ).toBe(400);
      expect(invoke).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    },
  );
  it("does not register legacy URLs or disabled slices", async () => {
    const enabled = await setup(),
      disabled = await setup({ enabled: false });
    for (const route of allRoutes) {
      expect(
        (
          await enabled.request(
            pathFor(route).replace("/api/neon/finance/", "/api/finance/"),
            route.method!,
            input(route.code!),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await disabled.request(
            pathFor(route),
            route.method!,
            input(route.code!),
          )
        ).status,
      ).toBe(404);
    }
  });
  it.each([
    undefined,
    "0",
    "-1",
    "1e2",
    "1.5",
    "9007199254740993",
    '"1',
    '1"',
    "1,2",
  ])("returns 428 for invalid If-Match %s", async (version) => {
    const { request, invoke } = await setup();
    const route = allRoutes[0]!;
    const response = await request(
      pathFor(route),
      "post",
      input(route.code!),
      version === undefined ? {} : { "if-match": version },
    );
    expect(response.status).toBe(428);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("preserves service HTTP errors", async () => {
    const { request, invoke } = await setup();
    invoke.mockRejectedValueOnce(
      new HttpError(400, "FINANCE_CUSTOM_INVALID", "Invalid"),
    );
    expect(
      (
        await request(
          "/api/neon/finance/rounding/resolve",
          "post",
          input("finance.rounding.resolve"),
        )
      ).status,
    ).toBe(400);
  });
  it.each(["budget", "commitment", "tax"])(
    "rejects unlinked %s reversals before execution",
    async (area) => {
      const { request, invoke, enqueue } = await setup();
      expect(
        (await request(`/api/neon/finance/${area}/reverse`, "post", envelope))
          .status,
      ).toBe(400);
      expect(invoke).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    },
  );
  it.each(["fx", "intercompany", "invalid"])(
    "does not execute an ordinary close from reversal kind %s",
    async (kind) => {
      const { request, enqueue } = await setup();
      expect(
        (
          await request("/api/neon/finance/close/reverse", "post", {
            ...envelope,
            kind,
          })
        ).status,
      ).toBe(400);
      expect(enqueue).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid recovery kind before enqueue", async () => {
    const { request, enqueue } = await setup();
    expect(
      (
        await request("/api/neon/finance/close/recover", "post", {
          ...envelope,
          kind: "invalid",
        })
      ).status,
    ).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("validates planning identity and output scope before creating a run", async () => {
    const { request, invoke, enqueue } = await setup();
    for (const body of [
      { run: {} },
      { run: { id: uuid }, outputs: {} },
      { run: { id: uuid }, outputs: [{ planningRunId: "another-run" }] },
    ])
      expect(
        (await request("/api/neon/finance/planning/run", "post", body)).status,
      ).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("allows planning approval with its dedicated permission", async () => {
    const { request, invoke } = await setup({
      permissions: ["finance.planning.approve"],
    });
    expect(
      (
        await request("/api/neon/finance/planning/run", "post", {
          runId: uuid,
          expectedStatus: "completed",
          targetStatus: "approved",
        })
      ).status,
    ).toBe(200);
    expect(invoke).toHaveBeenCalled();
  });
  it("reports unavailable service methods and queues as 503", async () => {
    const { request, finance, enqueue } = await setup();
    (finance.slices.f4.services as Record<string, unknown>).movements = {};
    expect(
      (
        await request(
          "/api/neon/finance/inventory/move",
          "post",
          input("finance.inventory.move"),
        )
      ).status,
    ).toBe(503);
    enqueue.mockRejectedValueOnce(
      new Error("FINANCE_DURABLE_JOBS_UNAVAILABLE"),
    );
    expect(
      (
        await request(
          "/api/neon/finance/close/run",
          "post",
          input("finance.close.run"),
        )
      ).status,
    ).toBe(503);
  });
  it("rejects malformed numeric query values and empty rebuild coordinates", async () => {
    const { request, invoke, enqueue } = await setup();
    for (const value of [
      "abc",
      "-1",
      "1.5",
      "9007199254740993",
      "1&fiscalYear=2",
    ])
      expect(
        (
          await request(
            `/api/neon/finance/budget/balance?fiscalYear=${value}`,
            "get",
          )
        ).status,
      ).toBe(400);
    expect(
      (await request("/api/neon/finance/inventory/rebuild", "post", {})).status,
    ).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("uses trusted actor identity in queued and immediate commands", async () => {
    const { request, invoke, enqueue } = await setup();
    const body = {
      ...envelope,
      actor: {
        tenantId: "attacker",
        principalId: "attacker",
        permissionCodes: ["*"],
      },
    };
    await request("/api/neon/finance/budget/command", "post", body);
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          tenantId: uuid,
          principalId: uuid,
          planeKey: "neon",
        }),
      }),
    );
    await request("/api/neon/finance/commitment/fulfill", "post", body);
    expect(enqueue).toHaveBeenCalledWith(
      "f3",
      "finance.commitment.fulfill",
      expect.objectContaining({ tenantId: uuid }),
      uuid,
      expect.objectContaining({
        command: expect.objectContaining({
          actor: expect.objectContaining({ tenantId: uuid }),
        }),
      }),
    );
  });
  it("does not silently fall back to currency defaults for invalid rounding slots", async () => {
    const { request, invoke } = await setup();
    expect(
      (
        await request("/api/neon/finance/rounding/resolve", "post", {
          ...input("finance.rounding.resolve"),
          slot: "unknown",
        })
      ).status,
    ).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("returns 404 for a missing inventory balance with response enforcement enabled", async () => {
    const { request, finance } = await setup();
    (finance.slices.f4.services as Record<string, unknown>).queries = {
      balance: async () => undefined,
    };
    expect(
      (await request("/api/neon/finance/inventory/balance", "get")).status,
    ).toBe(404);
  });
  it("enqueues the scheduled cross-book execution ID", async () => {
    const { request, finance, enqueue } = await setup();
    (finance.slices.f3.services as Record<string, unknown>).crossBook = {
      schedule: async () => ({ resourceId: "execution-1" }),
    };
    expect(
      (await request("/api/neon/finance/cross-book/execute", "post", envelope))
        .status,
    ).toBe(202);
    expect(enqueue).toHaveBeenCalledWith(
      "f3",
      "finance.cross_book.execute",
      expect.anything(),
      "execution-1",
      expect.objectContaining({ executionId: "execution-1" }),
    );
  });
  it("enforces reversal permissions even when submitted through ordinary queue routes", async () => {
    const { request, enqueue } = await setup({
      permissions: ["finance.commitment.post", "finance.close.execute"],
    });
    expect(
      (
        await request("/api/neon/finance/commitment/fulfill", "post", {
          ...envelope,
          payload: { reversesFulfillmentId: uuid },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/neon/finance/close/run", "post", {
          ...envelope,
          kind: "asset",
          payload: { reversesReserveId: uuid },
        })
      ).status,
    ).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { ...envelope, payload: [] },
    { ...envelope, idempotencyKey: "" },
    { command: [] },
  ])("rejects malformed command envelopes before enqueue", async (body) => {
    const { request, enqueue } = await setup();
    expect(
      (await request("/api/neon/finance/commitment/fulfill", "post", body))
        .status,
    ).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
