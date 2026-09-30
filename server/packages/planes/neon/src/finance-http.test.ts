import { describe, expect, it, vi } from "vitest";
import {
  routeContracts,
  type RequestHandler,
} from "@athyper/server-runtime-http";
import {
  financeEntryPoints,
  type NeonFinanceRegistration,
} from "./register-finance.js";
import { registerFinanceHttpRoutes } from "./finance-http.js";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context = {
  tenantId,
  principalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  planeKey: "neon",
  requestId: "request-1",
  profileHash: "hash",
  permissions: {
    allowed: ["finance.budget.manage"],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
    principalFingerprint: "p",
    profileHash: "hash",
    schemaHash: "s",
    resolvedAt: 1,
  },
} as never;
function app() {
  const handlers = new Map<string, RequestHandler[]>(),
    target = {
      get: (path: string, ...value: RequestHandler[]) => {
        handlers.set(`get ${path}`, value);
      },
      post: (path: string, ...value: RequestHandler[]) => {
        handlers.set(`post ${path}`, value);
      },
    };
  return { application: target as never, handlers };
}
function registration(
  enabled = true,
  services: Record<string, unknown> = {},
): NeonFinanceRegistration {
  return {
    executionPlane: "neon",
    flags: {
      f2BudgetPlanning: enabled,
      f3LedgerCommitments: false,
      f4InventoryFifo: false,
      f5Tax: false,
      f6Closing: false,
    },
    slices: {
      f2: {
        enabled,
        entryPoints: financeEntryPoints.f2,
        services,
        readiness: async () => ({ status: "healthy" }),
      },
      f3: {
        enabled: false,
        entryPoints: [],
        services: {},
        readiness: async () => ({ status: "healthy" }),
      },
      f4: {
        enabled: false,
        entryPoints: [],
        services: {},
        readiness: async () => ({ status: "healthy" }),
      },
      f5: {
        enabled: false,
        entryPoints: [],
        services: {},
        readiness: async () => ({ status: "healthy" }),
      },
      f6: {
        enabled: false,
        entryPoints: [],
        services: {},
        readiness: async () => ({ status: "healthy" }),
      },
    },
    enqueue: vi.fn(),
    executeWorker: vi.fn(),
  };
}

describe("finance HTTP binding", () => {
  it("registers no routes for disabled slices", () => {
    const fixture = app();
    registerFinanceHttpRoutes(fixture.application, {
      authenticate: ((_r, _s, next) => next()) as RequestHandler,
      readContext: () => context,
      finance: registration(false),
    });
    expect(routeContracts(fixture.application)).toHaveLength(0);
  });
  it("registers executable contracts and replaces an untrusted command actor", async () => {
    const mutate = vi.fn(async (command) => ({
        kind: "applied",
        actor: command.actor,
      })),
      fixture = app();
    registerFinanceHttpRoutes(fixture.application, {
      authenticate: ((_r, _s, next) => next()) as RequestHandler,
      readContext: () => context,
      finance: registration(true, {
        budget: { mutate },
        balances: { reconcile: vi.fn(), rebuild: vi.fn() },
        planningRuns: { create: vi.fn(), transition: vi.fn() },
        planningOutputs: { list: vi.fn() },
      }),
    });
    expect(routeContracts(fixture.application)).toHaveLength(
      financeEntryPoints.f2.filter((point) => point.kind === "route").length,
    );
    const handler = fixture.handlers
      .get("post /api/neon/finance/budget/command")!
      .at(-1)!;
    const output: { status?: number; body?: unknown } = {};
    const response = {
      status: (value: number) => {
        output.status = value;
        return response;
      },
      json: (value: unknown) => {
        output.body = value;
        return response;
      },
    };
    await handler(
      {
        body: {
          commandId: "command-1",
          commandCode: "finance.budget.mutate",
          idempotencyKey: "key",
          requestFingerprint: "hash",
          actor: { planeKey: "mesh" },
          payload: { transactionType: "reserve" },
        },
      } as never,
      response as never,
      vi.fn(),
    );
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ planeKey: "neon", tenantId }),
      }),
    );
    expect(output.status).toBe(200);
  });
});
