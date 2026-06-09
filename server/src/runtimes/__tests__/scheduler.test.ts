// server/src/runtimes/__tests__/scheduler.test.ts
//
// Acceptance tests for startScheduler().
//
// Exit criteria for Phase 2A:
//   ✓ BullMQ jobs service starts (jobs.start() called — registers repeatable schedulers)
//   ✓ IAM outbox worker is NOT created (scheduler doesn't do session invalidation)
//   ✓ No HTTP server is created (express() must not be called)
//   ✓ Lifecycle shutdown handler is registered for jobs service

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerDeps } from "../../kernel/bootstrap.js";
import { Lifecycle } from "../../lifecycle.js";

// ─── Stubs ────────────────────────────────────────────────────────────────────

vi.mock("@athyper/svc-iam", () => ({
  createIamOutboxWorker: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

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
      verifyToken: vi.fn(), warmUp: vi.fn(), getJwksHealth: vi.fn(() => ({})),
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

describe("startScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "once").mockImplementation(() => process);
  });

  it("starts the BullMQ jobs service to register repeatable schedulers", async () => {
    const deps = makeStubDeps();
    const { startScheduler } = await import("../scheduler.js");
    await startScheduler(deps);

    expect(deps.jobs.start).toHaveBeenCalledOnce();
  });

  it("signals lifecycle readiness after scheduler startup", async () => {
    const deps = makeStubDeps();
    const onReady = vi.fn();
    deps.lifecycle.onReady(onReady);

    const { startScheduler } = await import("../scheduler.js");
    await startScheduler(deps);
    await new Promise((r) => setImmediate(r));

    expect(onReady).toHaveBeenCalledOnce();
  });

  it("does NOT create an IAM outbox worker", async () => {
    const { createIamOutboxWorker } = await import("@athyper/svc-iam");
    const deps = makeStubDeps();

    const { startScheduler } = await import("../scheduler.js");
    await startScheduler(deps);

    expect(createIamOutboxWorker).not.toHaveBeenCalled();
  });

  it("does not create an HTTP server (express() not called)", async () => {
    const express = await import("express");
    const deps = makeStubDeps();

    const { startScheduler } = await import("../scheduler.js");
    await startScheduler(deps);

    expect(express.default).not.toHaveBeenCalled();
  });

  it("registers a lifecycle shutdown handler that stops the jobs service", async () => {
    const deps = makeStubDeps();
    const { startScheduler } = await import("../scheduler.js");
    await startScheduler(deps);

    // Trigger shutdown via lifecycle directly (bypasses process.exit)
    await deps.lifecycle.shutdown("test");

    expect(deps.jobs.stop).toHaveBeenCalledOnce();
  });
});
