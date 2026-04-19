// server/src/kernel/__tests__/bootstrap.test.ts
//
// Acceptance tests for bootstrap().
//
// Exit criteria for Phase 1:
//   ✓ bootstrap() resolves to a deps bag with all required keys
//   ✓ objectStorageRef.current is null when objectStorage is not configured
//   ✓ db.close() is called on lifecycle.shutdown()
//   ✓ redis.disconnect() is called on lifecycle.shutdown()
//   ✓ db.close() runs AFTER redis.disconnect() (LIFO — redis registered after db)
//
// All external adapter factories are stubbed so this test runs without any
// real infrastructure (no DB, Redis, Keycloak, or S3 required).

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Stub adapter factories ───────────────────────────────────────────────────

const mockDbClose = vi.fn(() => Promise.resolve());
const mockRedisDisconnect = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();

vi.mock("@athyper/adapter-db", () => ({
  createDbAdapter: vi.fn(() => ({
    kysely: {},
    health: vi.fn(() => Promise.resolve({ healthy: true })),
    close: mockDbClose,
  })),
}));

vi.mock("@athyper/adapter-memorycache", () => ({
  createRedisClient: vi.fn(() => ({
    get: mockRedisGet,
    set: vi.fn(),
    del: vi.fn(),
    setex: mockRedisSetex,
    scan: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
    expire: vi.fn(),
    ping: vi.fn(() => Promise.resolve("PONG")),
    disconnect: mockRedisDisconnect,
  })),
}));

vi.mock("@athyper/adapter-auth", () => ({
  createAuthAdapter: vi.fn(() => ({
    verifyToken: vi.fn(),
    warmUp: vi.fn(() => Promise.resolve()),
    getJwksHealth: vi.fn(() => ({})),
  })),
}));

vi.mock("@athyper/adapter-objectstorage", () => ({
  createS3ObjectStorageAdapter: vi.fn(() => ({
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    healthCheck: vi.fn(() => Promise.resolve({ healthy: true })),
    validateBucketAccess: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock("@athyper/svc-jobs", () => ({
  createJobsService: vi.fn(() => ({
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    queues: new Map(),
  })),
  createWfOutboxHandler: vi.fn(() => ({ handle: vi.fn() })),
}));

// Stub relative framework adapters loaded by bootstrap.
// Paths are resolved relative to this test file:
//   __tests__/ → kernel/ → src/ → server/ → framework/
vi.mock("../../../framework/runtime/services/jobs/adapters/webhook.adapter.js", () => ({
  createWebhookAdapter: vi.fn(() => ({
    send: vi.fn(),
    healthCheck: vi.fn(() => Promise.resolve("healthy")),
  })),
}));

vi.mock("../../../framework/runtime/services/jobs/adapters/email.adapter.js", () => ({
  createEmailAdapter: vi.fn(() => ({
    send: vi.fn(),
    healthCheck: vi.fn(() => Promise.resolve("healthy")),
  })),
}));

// ─── Import under test (after all vi.mock declarations) ───────────────────────

import { bootstrap } from "../bootstrap.js";
import type { ServerConfig } from "../../config.js";

// ─── Minimal valid config (no email, no object storage) ───────────────────────

const baseConfig: ServerConfig = {
  env: "local",
  port: 4000,
  logLevel: "silent" as ServerConfig["logLevel"],
  shutdownTimeoutMs: 15_000,
  db: {
    url: "postgresql://test:test@localhost:5432/test",
    poolMax: 5,
  },
  redis: {
    url: "redis://localhost:6379",
    connectTimeout: 5_000,
    maxRetriesPerRequest: 2,
    errorLogCooldownMs: 10_000,
  },
  iam: {
    issuerUrl: "http://localhost:8080/realms/athyper",
    realm: "athyper",
    clientId: "athyper-api",
    clientSecret: "",
  },
  outbox: { pollIntervalMs: 10_000 },
  platformControl: {
    enabled: false,
    realmKey: "platform-control",
    roles: {
      productAdmin: "PRODUCT_ADMIN",
      tenantManager: "TENANT_MANAGER",
      supportAdmin: "SUPPORT_ADMIN",
      readOnlySupport: "READ_ONLY_SUPPORT",
    },
    rolePermissions: {
      PRODUCT_ADMIN: [],
      TENANT_MANAGER: [],
      SUPPORT_ADMIN: [],
      READ_ONLY_SUPPORT: [],
    },
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves to a deps bag with all required keys", async () => {
    const deps = await bootstrap(baseConfig, null);

    expect(deps.config).toBe(baseConfig);
    expect(deps.kernelConfig).toBeNull();
    expect(deps.logger).toBeDefined();
    expect(deps.lifecycle).toBeDefined();
    expect(deps.db).toBeDefined();
    expect(deps.db.kysely).toBeDefined();
    expect(deps.redis).toBeDefined();
    expect(deps.auth).toBeDefined();
    expect(deps.objectStorageRef).toBeDefined();
    expect(deps.jobs).toBeDefined();
    expect(deps.audit).toBeDefined();
  });

  it("objectStorageRef.current is null when objectStorage is not configured", async () => {
    const deps = await bootstrap(baseConfig, null);
    expect(deps.objectStorageRef.current).toBeNull();
  });

  it("calls db.close() on lifecycle.shutdown()", async () => {
    const deps = await bootstrap(baseConfig, null);
    await deps.lifecycle.shutdown("test");
    expect(mockDbClose).toHaveBeenCalledOnce();
  });

  it("calls redis.disconnect() on lifecycle.shutdown() for both cache and BullMQ clients", async () => {
    // bootstrap constructs TWO ioredis clients:
    //   - `redis`         : cache client (JWKS / feature flags / OAuth2 / IAM session)
    //   - `webhookRedis`  : BullMQ-tuned client (maxRetriesPerRequest: null)
    // Both register disconnect() via lifecycle.onShutdown — enforces F1 isolation.
    const deps = await bootstrap(baseConfig, null);
    await deps.lifecycle.shutdown("test");
    expect(mockRedisDisconnect).toHaveBeenCalledTimes(2);
  });

  it("redis clients disconnect before db.close() on shutdown (LIFO order)", async () => {
    // Both redis clients are registered after db, so in LIFO order they shut
    // down first. This preserves the invariant: consumers stop before connections.
    const callOrder: string[] = [];
    mockDbClose.mockImplementation(() => { callOrder.push("db.close"); return Promise.resolve(); });
    mockRedisDisconnect.mockImplementation(() => { callOrder.push("redis.disconnect"); });

    const deps = await bootstrap(baseConfig, null);
    await deps.lifecycle.shutdown("test");

    expect(callOrder).toEqual(["redis.disconnect", "redis.disconnect", "db.close"]);
  });

  it("objectStorageRef.current is set when objectStorage is configured", async () => {
    const configWithStorage: ServerConfig = {
      ...baseConfig,
      objectStorage: {
        endpoint: "http://localhost:9000",
        accessKey: "minioadmin",
        secretKey: "minioadmin",
        region: "us-east-1",
        bucket: "athyper-local",
        useSSL: false,
        multipartPartSizeMb: 5,
        multipartQueueSize: 4,
        maxUploadMb: 100,
        presignedTtlSeconds: 900,
      },
    };

    const deps = await bootstrap(configWithStorage, null);
    expect(deps.objectStorageRef.current).not.toBeNull();
  });
});
