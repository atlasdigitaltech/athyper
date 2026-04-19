// server/src/runtimes/__tests__/api.test.ts
//
// Acceptance tests for startApi() — Phase 2B exit criteria.
//
// Exit criteria:
//   ✓ HTTP server is created (express() called, app.listen() called)
//   ✓ IAM outbox worker is NOT created (moved to MODE=worker)
//   ✓ BullMQ jobs service NOT started from api (moved to MODE=worker/scheduler)

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerDeps } from "../../kernel/bootstrap.js";
import { Lifecycle } from "../../lifecycle.js";

// ─── Stubs ────────────────────────────────────────────────────────────────────

vi.mock("@athyper/svc-iam", () => ({
  createIamOutboxWorker: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  registerIamRoutes: vi.fn(),
}));

vi.mock("@athyper/svc-metadata", () => ({ registerMetadataRoutes: vi.fn() }));
vi.mock("@athyper/svc-records", () => ({ registerRecordsRoutes: vi.fn() }));
vi.mock("@athyper/svc-documents", () => ({ registerDocumentsRoutes: vi.fn() }));
vi.mock("@athyper/svc-collab", () => ({ registerCollabRoutes: vi.fn() }));
vi.mock("@athyper/svc-finance", () => ({ registerFinanceRoutes: vi.fn() }));
vi.mock("@athyper/svc-platform", () => ({
  registerPlatformRoutes: vi.fn(),
  registerRefRoutes: vi.fn(),
  registerTaxonomyRoutes: vi.fn(),
  registerClassificationRoutes: vi.fn(),
  registerCommerceRoutes: vi.fn(),
  registerNotificationRoutes: vi.fn(),
}));
vi.mock("@athyper/svc-jobs", () => ({ registerJobsRoutes: vi.fn() }));

// Paths are relative to this test file (one level deeper than api.ts → need ../../../)
vi.mock("../../../framework/runtime/services/workflow/routes/index.js", () => ({
  registerWorkflowRoutes: vi.fn(),
}));
vi.mock("../../../framework/runtime/services/policy/routes/index.js", () => ({
  registerPolicyRoutes: vi.fn(),
}));
vi.mock("../../../framework/runtime/services/audit/routes/index.js", () => ({
  registerAuditRoutes: vi.fn(),
}));
vi.mock("../../../framework/runtime/services/content/routes/index.js", () => ({
  registerContentRoutes: vi.fn(),
}));
vi.mock("../../../framework/runtime/services/integration/routes/index.js", () => ({
  registerIntegrationRoutes: vi.fn(),
}));

vi.mock("../../metrics.js", () => ({
  createCacheMetrics: vi.fn(() => ({})),
  metricsHandler: vi.fn(),
  registerJobQueues: vi.fn(),
}));

vi.mock("../../audit.js", () => ({
  makeAuditEvent: vi.fn((e) => e),
}));

const mockListen = vi.fn((_port: number, cb?: () => void) => {
  cb?.();
  return {} as never;
});

vi.mock("express", () => {
  const mockRouter = {
    get: vi.fn(), post: vi.fn(), put: vi.fn(),
    patch: vi.fn(), delete: vi.fn(), use: vi.fn(),
  };
  const mockApp = {
    disable: vi.fn(),
    use: vi.fn(),
    get: vi.fn(),
    listen: mockListen,
  };
  // In Express 5, express.json is a property on the default export function itself.
  const mockExpress = Object.assign(vi.fn(() => mockApp), {
    json: vi.fn(() => vi.fn()),
    static: vi.fn(() => vi.fn()),
  });
  return {
    default: mockExpress,
    Router: vi.fn(() => mockRouter),
  };
});

// ─── Stub ServerDeps factory ──────────────────────────────────────────────────

function makeStubDeps(): ServerDeps {
  const lifecycle = new Lifecycle();

  return {
    config: {
      env: "local",
      port: 4000,
      logLevel: "silent" as ServerDeps["config"]["logLevel"],
      shutdownTimeoutMs: 100,
      db: { url: "postgresql://test/test", poolMax: 5 },
      redis: { url: "redis://localhost:6379", connectTimeout: 5_000, maxRetriesPerRequest: 2, errorLogCooldownMs: 0 },
      iam: { issuerUrl: "http://localhost:8080/realms/athyper", realm: "athyper", clientId: "athyper-api", clientSecret: "" },
      outbox: { pollIntervalMs: 1_000 },
      platformControl: {
        enabled: false,
        realmKey: "platform-control",
        roles: { productAdmin: "PRODUCT_ADMIN", tenantManager: "TENANT_MANAGER", supportAdmin: "SUPPORT_ADMIN", readOnlySupport: "READ_ONLY_SUPPORT" },
        rolePermissions: { PRODUCT_ADMIN: [], TENANT_MANAGER: [], SUPPORT_ADMIN: [], READ_ONLY_SUPPORT: [] },
      },
    },
    kernelConfig: null,
    logger: {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(),
    },
    lifecycle,
    db: { kysely: {} as never, health: vi.fn(), close: vi.fn() } as never,
    redis: {
      get: vi.fn(), set: vi.fn(), del: vi.fn(), setex: vi.fn(),
      scan: vi.fn(), sadd: vi.fn(), srem: vi.fn(), smembers: vi.fn(),
      expire: vi.fn(), ping: vi.fn(), disconnect: vi.fn(),
    } as never,
    auth: {
      verifyToken: vi.fn(),
      warmUp: vi.fn(() => Promise.resolve()),
      getJwksHealth: vi.fn(() => ({})),
    } as never,
    objectStorageRef: { current: null },
    jobs: {
      start: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
      queues: new Map(),
      isRunning: false,
    } as never,
    audit: { write: vi.fn(() => Promise.resolve()) },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("startApi (Phase 2B — HTTP-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "once").mockImplementation(() => process);
  });

  it("creates an HTTP server (express() called, app.listen() called)", async () => {
    const express = await import("express");
    const deps = makeStubDeps();

    const { startApi } = await import("../api.js");
    await startApi(deps);

    expect(express.default).toHaveBeenCalledOnce();
    expect(mockListen).toHaveBeenCalledWith(deps.config.port, expect.any(Function));
  });

  it("does NOT create an IAM outbox worker", async () => {
    const { createIamOutboxWorker } = await import("@athyper/svc-iam");
    const deps = makeStubDeps();

    const { startApi } = await import("../api.js");
    await startApi(deps);

    expect(createIamOutboxWorker).not.toHaveBeenCalled();
  });

  it("does NOT start the BullMQ jobs service", async () => {
    const deps = makeStubDeps();

    const { startApi } = await import("../api.js");
    await startApi(deps);

    expect(deps.jobs.start).not.toHaveBeenCalled();
  });

  // B.3 — JWKS warm-up must not block boot. It is registered as a
  // lifecycle.onReady() handler and fires after app.listen() resolves.
  it("does NOT warm up JWKS before app.listen()", async () => {
    const deps = makeStubDeps();

    let warmupCalledAt: number | null = null;
    let listenCalledAt: number | null = null;
    (deps.auth.warmUp as ReturnType<typeof vi.fn>).mockImplementation(() => {
      warmupCalledAt = Date.now();
      return Promise.resolve();
    });
    mockListen.mockImplementationOnce((_port: number, cb?: () => void) => {
      listenCalledAt = Date.now();
      cb?.();
      return {} as never;
    });

    const { startApi } = await import("../api.js");
    await startApi(deps);

    expect(listenCalledAt).not.toBeNull();
    // warmUp fires inside lifecycle.signalReady(), invoked from the listen
    // callback — so either it runs at/after listen, or not yet at all.
    if (warmupCalledAt !== null) {
      expect(warmupCalledAt).toBeGreaterThanOrEqual(listenCalledAt!);
    }
  });

  it("invokes auth.warmUp() exactly once via lifecycle.signalReady()", async () => {
    const deps = makeStubDeps();

    const { startApi } = await import("../api.js");
    await startApi(deps);

    // signalReady() is scheduled from the listen callback and awaits the
    // onReady handler chain; microtask drain lets the warm-up resolve.
    await new Promise((r) => setImmediate(r));

    expect(deps.auth.warmUp).toHaveBeenCalledTimes(1);
  });
});
