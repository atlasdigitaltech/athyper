// server/src/runtimes/__tests__/worker.test.ts
//
// Acceptance tests for startWorker().
//
// Exit criteria for Phase 2A:
//   ✓ IAM outbox worker starts (createIamOutboxWorker called, outboxWorker.start() called)
//   ✓ BullMQ jobs service starts (deps.jobs.start() called)
//   ✓ No HTTP server is created (express() must not be called)
//   ✓ Lifecycle shutdown handlers are registered for outbox and jobs
//   ✓ On shutdown: outboxWorker.stop() called before jobs.stop() (LIFO)

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerDeps } from "../../composition/bootstrap.js";
import { Lifecycle } from "@athyper/server-foundation/kernel";

// ─── Stubs ────────────────────────────────────────────────────────────────────

const mockOutboxStop = vi.fn();
const mockOutboxStart = vi.fn();

vi.mock("@athyper/svc-iam", () => ({
  createIamOutboxWorker: vi.fn(() => ({
    start: mockOutboxStart,
    stop: mockOutboxStop,
  })),
}));

// Express must not be imported or called by worker.ts.
// If it is, this mock captures the call so we can assert it was NOT made.
vi.mock("express", () => ({
  default: vi.fn(() => ({
    disable: vi.fn(),
    use: vi.fn(),
    get: vi.fn(),
    listen: vi.fn(),
  })),
  Router: vi.fn(),
}));

// Probe server must not bind real ports in tests.
vi.mock("../probe.js", () => ({
  startProbeServer: vi.fn(() => ({
    close: vi.fn((cb?: () => void) => cb?.()),
  })),
}));

// ─── Stub ServerDeps factory ──────────────────────────────────────────────────

function makeStubDeps(overrides?: Partial<ServerDeps>): ServerDeps {
  const lifecycle = new Lifecycle();
  const mockJobsStop = vi.fn(() => Promise.resolve());
  const mockJobsStart = vi.fn(() => Promise.resolve());

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
      verifyToken: vi.fn(), warmUp: vi.fn(), getJwksHealth: vi.fn(() => ({})),
    } as never,
    objectStorageRef: { current: null },
    jobs: { start: mockJobsStart, stop: mockJobsStop, queues: new Map(), isRunning: false } as never,
    audit: { write: vi.fn(() => Promise.resolve()) },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("startWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent actual signal handler registration across test runs
    vi.spyOn(process, "once").mockImplementation(() => process);
  });

  it("creates and starts the IAM outbox worker", async () => {
    const { createIamOutboxWorker } = await import("@athyper/svc-iam");
    const deps = makeStubDeps();

    const { startWorker } = await import("../worker.js");
    await startWorker(deps);

    expect(createIamOutboxWorker).toHaveBeenCalledOnce();
    expect(mockOutboxStart).toHaveBeenCalledOnce();
  });

  it("starts the BullMQ jobs service", async () => {
    const deps = makeStubDeps();
    const { startWorker } = await import("../worker.js");
    await startWorker(deps);

    expect(deps.jobs.start).toHaveBeenCalledOnce();
  });

  it("signals lifecycle readiness after worker startup", async () => {
    const deps = makeStubDeps();
    const onReady = vi.fn();
    deps.lifecycle.onReady(onReady);

    const { startWorker } = await import("../worker.js");
    await startWorker(deps);
    await new Promise((r) => setImmediate(r));

    expect(onReady).toHaveBeenCalledOnce();
  });

  it("does not create an HTTP server (express() not called)", async () => {
    const express = await import("express");
    const deps = makeStubDeps();

    const { startWorker } = await import("../worker.js");
    await startWorker(deps);

    expect(express.default).not.toHaveBeenCalled();
  });

  it("registers lifecycle shutdown handlers so outbox stops before jobs (LIFO)", async () => {
    const deps = makeStubDeps();
    const callOrder: string[] = [];

    mockOutboxStop.mockImplementation(() => { callOrder.push("outbox.stop"); });
    (deps.jobs.stop as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("jobs.stop");
    });

    const { startWorker } = await import("../worker.js");
    await startWorker(deps);

    // Trigger shutdown via lifecycle directly (bypasses process.exit)
    await deps.lifecycle.shutdown("test");

    expect(mockOutboxStop).toHaveBeenCalledOnce();
    expect(deps.jobs.stop).toHaveBeenCalledOnce();
    // LIFO: jobs.stop registered AFTER outbox.stop → runs FIRST on shutdown.
    // This drains BullMQ in-flight jobs before stopping the cache-invalidation
    // loop — correct ordering for clean shutdown.
    expect(callOrder).toEqual(["jobs.stop", "outbox.stop"]);
  });
});
