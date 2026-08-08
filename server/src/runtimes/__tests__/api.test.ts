// server/src/runtimes/__tests__/api.test.ts
//
// Acceptance tests for startApi() — Phase 2B exit criteria.
//
// Exit criteria:
//   ✓ HTTP server is created (express() called, app.listen() called)
//   ✓ IAM outbox worker is NOT created (moved to MODE=worker)
//   ✓ BullMQ jobs service NOT started from api (moved to MODE=worker/scheduler)

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerDeps } from "../../composition/bootstrap.js";
import { Lifecycle } from "@athyper/server-foundation/kernel";

// ─── Stubs ────────────────────────────────────────────────────────────────────

vi.mock("@athyper/svc-iam", () => ({
  LogSampler: class { decide() { return { shouldLog: true, suppressedRun: 0, windowCount: 1 }; } },
  crossCheckClaimsAgainstContext: vi.fn(() => ({ ok: true })),
  enforceAuthPipeline: vi.fn(async () => ({ ok: true })),
  loadRequiredActionMatrix: vi.fn(() => ({})),
  createIamOutboxWorker: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  checkPermission: vi.fn(async () => ({ allowed: true })),
  checkPermissionBatch: vi.fn(async () => []),
  getEffectiveModuleAccess: vi.fn(async () => []),
  createPermissionResolverRegistry: vi.fn(() => ({})),
  createPermissionContextMiddleware: vi.fn(() => vi.fn()),
  createMeshAuthorizationRuntime: vi.fn(() => ({ decisions: {} })),
  createNeonAuthorizationRuntime: vi.fn(() => ({ decisions: {} })),
  withNormalizedOperationScopeRollout: vi.fn((runtime) => runtime),
  SqlNormalizedEntitlementResolver: vi.fn(),
  SqlOperationScopeRolloutResolver: vi.fn(),
  SqlSessionV2CatalogRepository: vi.fn(),
  isPlaneKey: vi.fn(() => true),
  createPlaneDatabaseRegistry: vi.fn(() => ({ assertReady: vi.fn(async () => undefined) })),
  registerIamRoutes: vi.fn(),
}));

vi.mock("@athyper/svc-metadata", () => ({
  createRuntimeBootstrapLoader: vi.fn(() => vi.fn()),
  ExecutionDescriptorProvider: vi.fn(),
  RuntimeBootstrapProvider: vi.fn(),
  registerMetadataRoutes: vi.fn(),
  runComplianceSuiteIfDev: vi.fn(),
  createEntityCompilerService: vi.fn(() => ({ validateVersionForActivation: vi.fn() })),
  createCatalogCompiler: vi.fn(),
}));
vi.mock("@athyper/svc-meta-entity-authoring", () => ({ registerMetaEntityAuthoringRoutes: vi.fn() }));
vi.mock("@athyper/plane-athyper-onboarding", () => ({ registerOnboardingRoutes: vi.fn() }));
vi.mock("@athyper/svc-numbering-runtime", () => ({ NumberingPolicyTester: vi.fn() }));
vi.mock("@athyper/svc-shared", () => ({
  createResolverRoute: vi.fn(() => vi.fn()),
  registerAllResolvers: vi.fn(),
  resolvePrincipalIdOrNull: vi.fn(() => null),
  mapPostgresBusinessError: vi.fn(() => null),
}));
vi.mock("@athyper/svc-search", () => ({ registerSearchRoutes: vi.fn() }));
vi.mock("@athyper/svc-records", () => ({
  registerRecordsRoutes: vi.fn(),
  resolveEntityQueryRuntimeConfig: vi.fn(() => ({ enabled: false })),
}));
vi.mock("@athyper/svc-documents", () => ({ registerDocumentsRoutes: vi.fn() }));
vi.mock("@athyper/svc-collab", () => ({
  registerCollabRoutes: vi.fn(),
  registerCollabAttachmentRoutes: vi.fn(),
}));
vi.mock("@athyper/svc-finance", () => ({ registerFinanceRoutes: vi.fn() }));
vi.mock("@athyper/svc-platform", () => ({
  registerPlatformRoutes: vi.fn(),
  registerRefRoutes: vi.fn(),
  registerTaxonomyRoutes: vi.fn(),
  registerClassificationRoutes: vi.fn(),
  registerCommerceRoutes: vi.fn(),
  registerNotificationRoutes: vi.fn(),
}));
vi.mock("@athyper/svc-jobs", () => ({
  registerJobsRoutes: vi.fn(),
  registerJobsAdminRoutes: vi.fn(),
  registerJobsBoardRoutes: vi.fn(),
}));
vi.mock("@athyper/svc-master", () => ({
  registerMasterContactsRoutes: vi.fn(),
  registerMasterAddressRoutes: vi.fn(),
  registerMasterOwnerAddressContactRoutes: vi.fn(),
}));

// Paths are relative to this test file (one level deeper than api.ts → need ../../../)
vi.mock("@athyper/svc-workflow", () => ({
  registerWorkflowRoutes: vi.fn(),
  ConventionWorkflowSourceEntityAdapter: vi.fn(),
}));
vi.mock("@athyper/svc-business", () => ({ runLifecycleHooks: vi.fn() }));
vi.mock("@athyper/svc-policy", () => ({
  registerPolicyRoutes: vi.fn(),
}));
vi.mock("@athyper/svc-audit", () => ({
  registerAuditRoutes: vi.fn(),
}));
vi.mock("@athyper/svc-content", () => ({
  ClamavScanner: vi.fn(),
  registerContentRoutes: vi.fn(),
}));
vi.mock("@athyper/svc-integration", () => ({
  registerIntegrationRoutes: vi.fn(),
}));
vi.mock("@athyper/svc-doc-services", () => ({
  registerDocServicesRoutes: vi.fn(),
}));
vi.mock("@athyper/adapter-rendering-gotenberg", () => ({
  createGotenbergClient: vi.fn(() => ({})),
}));
vi.mock("@athyper/svc-ai", () => ({
  createAiServiceBundle: vi.fn(async () => ({
    aiRuntime: {},
    autonomyResolver: {},
    confidenceResolver: {},
    feedbackLogWriter: {},
  })),
  registerAiAgentRoutes: vi.fn(),
  registerAiRoutes: vi.fn(),
  registerAiThreadRoutes: vi.fn(),
}));
vi.mock("@athyper/runtime-http", () => ({
  createOpenApiRouter: vi.fn(() => vi.fn()),
  createFrameworkPerformanceMiddleware: vi.fn(() => vi.fn()),
  collectFrameworkPerformanceMetrics: vi.fn(() => []),
  startFrameworkPhase: vi.fn(() => ({ end: vi.fn() })),
}));
vi.mock("@athyper/runtime-contracts", () => ({ parseTokenClaims: vi.fn(() => ({})) }));
vi.mock("@athyper/platform-iam-auth-common", () => ({
  resolveRequiredActionsEnforcement: vi.fn(() => false),
  resolveTokenSchemaMode: vi.fn(() => "compat"),
}));
vi.mock("@athyper/server-foundation/monitoring/platform-metrics", () => ({
  createPlatformMetricCollector: vi.fn(() => vi.fn(async () => [])),
}));

vi.mock("../metrics.js", () => ({
  createAiLogMetrics: vi.fn(() => ({})),
  createCacheMetrics: vi.fn(() => ({})),
  metricsHandler: vi.fn(),
  observeHttpRequest: vi.fn(),
  recordAuthContextMismatch: vi.fn(),
  recordAuthContextMismatchSuppressed: vi.fn(),
  recordDeprecatedRouteHit: vi.fn(),
  recordTokenClaimsInvalid: vi.fn(),
  recordAuthTermination: vi.fn(),
  registerJobQueues: vi.fn(),
  registerMetricCollectors: vi.fn(),
}));

vi.mock("@athyper/svc-audit", () => ({
  makeAuditEvent: vi.fn((e) => e),
  registerAuditRoutes: vi.fn(),
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
      atlasAgent: {
        enabled: false,
        persistence: { enabled: false },
        tools: { enabled: false },
      } as never,
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
    platformDb: { kysely: {} as never, health: vi.fn(), close: vi.fn() } as never,
    meshDb: { kysely: {} as never, health: vi.fn(), close: vi.fn() } as never,
    redis: {
      get: vi.fn(), set: vi.fn(), del: vi.fn(), setex: vi.fn(),
      scan: vi.fn(), sadd: vi.fn(), srem: vi.fn(), smembers: vi.fn(),
      expire: vi.fn(), ping: vi.fn(), disconnect: vi.fn(), eval: vi.fn(),
      incr: vi.fn(), mget: vi.fn(),
      duplicate: vi.fn(() => ({
        on: vi.fn(),
        subscribe: vi.fn(async () => undefined),
        disconnect: vi.fn(),
      })),
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
