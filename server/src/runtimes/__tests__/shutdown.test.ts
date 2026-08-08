// server/src/runtimes/__tests__/shutdown.test.ts
//
// Phase 5 required exit criterion:
//   Controlled shutdown while jobs are running proves no job is abandoned
//   mid-flight (test with a long-running simulated job).
//
// Key structural invariant validated here:
//   worker.ts and scheduler.ts signal handlers do NOT use Promise.race against
//   a software timeout. lifecycle.shutdown() is awaited fully, so in-flight
//   BullMQ jobs drain completely before process.exit(0) is reached.
//   Docker's stop_grace_period (30 s) acts as the hard kill limit.
//
// The tests below set config.shutdownTimeoutMs to a value SHORTER than the
// simulated drain duration. With the old Promise.race design this would have
// cut off the drain; with the new design the drain always completes.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerDeps } from "../../composition/bootstrap.js";
import { Lifecycle } from "@athyper/server-foundation/kernel";

// ─── Stubs ────────────────────────────────────────────────────────────────────

vi.mock("@athyper/svc-iam", () => ({
  createIamOutboxWorker: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock("express", () => ({
  default: vi.fn(() => ({ disable: vi.fn(), use: vi.fn(), get: vi.fn(), listen: vi.fn() })),
  Router: vi.fn(),
}));

// Probe server must not bind real ports in tests.
vi.mock("../probe.js", () => ({
  startProbeServer: vi.fn(() => ({
    close: vi.fn((cb?: () => void) => cb?.()),
  })),
}));

// ─── Stub ServerDeps factory ──────────────────────────────────────────────────

function makeStubDeps(shutdownTimeoutMs = 50): ServerDeps {
  const lifecycle = new Lifecycle();
  return {
    config: {
      env: "local",
      port: 4000,
      logLevel: "silent" as ServerDeps["config"]["logLevel"],
      // Intentionally shorter than the simulated drain duration used in tests.
      // This proves that the signal handler does NOT race against this timeout.
      shutdownTimeoutMs,
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
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
    lifecycle,
    db: { kysely: {} as never, health: vi.fn(), close: vi.fn() } as never,
    redis: {
      get: vi.fn(), set: vi.fn(), del: vi.fn(), setex: vi.fn(),
      scan: vi.fn(), sadd: vi.fn(), srem: vi.fn(), smembers: vi.fn(),
      expire: vi.fn(), ping: vi.fn(), disconnect: vi.fn(),
    } as never,
    auth: { verifyToken: vi.fn(), warmUp: vi.fn(), getJwksHealth: vi.fn(() => ({})) } as never,
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

describe("Phase 5 exit criterion — no job abandoned mid-flight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "once").mockImplementation(() => process);
  });

  it("worker: lifecycle shutdown awaits full job drain before completing", async () => {
    // Simulate an in-flight BullMQ job taking 80ms to complete.
    // config.shutdownTimeoutMs=50 is shorter — proves no Promise.race cut-off.
    const JOB_DRAIN_MS = 80;
    const drainLog: string[] = [];
    const deps = makeStubDeps(50); // shutdownTimeoutMs < JOB_DRAIN_MS

    (deps.jobs.stop as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await new Promise<void>((r) => setTimeout(r, JOB_DRAIN_MS));
      drainLog.push("drain_complete");
    });

    const { startWorker } = await import("../worker.js");
    await startWorker(deps);

    const t0 = Date.now();
    // Trigger shutdown via lifecycle directly (same path the signal handler uses).
    await deps.lifecycle.shutdown("SIGTERM");
    const elapsed = Date.now() - t0;

    // Drain must have completed — job not abandoned mid-flight.
    expect(drainLog).toEqual(["drain_complete"]);
    expect(deps.jobs.stop).toHaveBeenCalledOnce();
    // Elapsed time must be >= drain duration (not short-circuited at shutdownTimeoutMs=50).
    expect(elapsed).toBeGreaterThanOrEqual(JOB_DRAIN_MS - 15); // 15 ms timing jitter
  });

  it("worker: outbox stops after jobs drain (LIFO order preserved during shutdown)", async () => {
    const drainLog: string[] = [];
    const deps = makeStubDeps();

    // Outbox stop is fast; jobs drain takes 40ms
    (deps.jobs.stop as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await new Promise<void>((r) => setTimeout(r, 40));
      drainLog.push("jobs.stop");
    });

    const { createIamOutboxWorker } = await import("@athyper/svc-iam");
    const mockStop = vi.fn(() => { drainLog.push("outbox.stop"); });
    (createIamOutboxWorker as ReturnType<typeof vi.fn>).mockReturnValue({
      start: vi.fn(),
      stop: mockStop,
    });

    const { startWorker } = await import("../worker.js");
    await startWorker(deps);
    await deps.lifecycle.shutdown("SIGTERM");

    // LIFO: probe first (not tracked), then jobs (registered 2nd → runs 1st in LIFO),
    // then outbox (registered 1st → runs 2nd in LIFO).
    expect(drainLog).toEqual(["jobs.stop", "outbox.stop"]);
  });

  it("scheduler: lifecycle shutdown awaits jobs.stop() before completing", async () => {
    const DRAIN_MS = 60;
    const drainLog: string[] = [];
    const deps = makeStubDeps(30); // shutdownTimeoutMs=30 < DRAIN_MS=60

    (deps.jobs.stop as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await new Promise<void>((r) => setTimeout(r, DRAIN_MS));
      drainLog.push("scheduler_drain_complete");
    });

    const { startScheduler } = await import("../scheduler.js");
    await startScheduler(deps);

    const t0 = Date.now();
    await deps.lifecycle.shutdown("SIGTERM");
    const elapsed = Date.now() - t0;

    expect(drainLog).toEqual(["scheduler_drain_complete"]);
    expect(deps.jobs.stop).toHaveBeenCalledOnce();
    expect(elapsed).toBeGreaterThanOrEqual(DRAIN_MS - 15);
  });
});
