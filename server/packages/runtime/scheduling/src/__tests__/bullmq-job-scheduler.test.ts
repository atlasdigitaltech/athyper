import { describe, expect, it, vi } from "vitest";

import {
  createBullMqJobScheduler as createProductionBullMqJobScheduler,
  createInMemoryScheduleOwnerRegistry,
  createRedisSchedulerLeaderLease,
  createSchedulingRuntime,
  type BullMqJobSchedulerOptions,
  type ScheduleOwnerRegistry,
} from "../index.js";

function createBullMqJobScheduler(options: BullMqJobSchedulerOptions) {
  return createProductionBullMqJobScheduler({
    ...options,
    ownerRegistry:
      options.ownerRegistry ?? createInMemoryScheduleOwnerRegistry(),
    ...(options.leaderLease || options.leaderElection !== undefined
      ? {}
      : { leaderElection: false as const }),
  });
}

describe("BullMQ job scheduler", () => {
  it("maps canonical cron and interval schedules", async () => {
    const upsertJobScheduler = vi.fn(async () => undefined);
    const removeJobScheduler = vi.fn(async () => true);
    const close = vi.fn(async () => undefined);
    const scheduler = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      createQueue: () => ({ upsertJobScheduler, removeJobScheduler, close }),
    });

    await scheduler.upsert({
      scheduleId: "notifications.daily",
      queue: "notifications",
      name: "digest",
      data: { tenantId: "tenant-1" },
      pattern: {
        kind: "cron",
        expression: "0 8 * * *",
        timezone: "Asia/Kuala_Lumpur",
      },
      options: { maxAttempts: 3, removeOnComplete: 100 },
    });
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "notifications.daily",
      { pattern: "0 8 * * *", tz: "Asia/Kuala_Lumpur" },
      {
        name: "digest",
        data: { tenantId: "tenant-1" },
        opts: { attempts: 3, removeOnComplete: 100 },
      },
    );
    await expect(scheduler.remove("notifications.daily")).resolves.toBe(true);
    await expect(scheduler.remove("missing")).resolves.toBe(false);
    await scheduler.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reconciles definitions once and rejects duplicate schedule ids", async () => {
    const upsert = vi.fn(async () => undefined);
    const definition = {
      scheduleId: "cleanup.hourly",
      queue: "maintenance",
      name: "cleanup",
      data: {},
      pattern: { kind: "interval" as const, everyMs: 3_600_000 },
    };
    const runtime = createSchedulingRuntime({
      scheduler: { upsert, remove: async () => false },
      definitions: [definition],
    });
    await runtime.start();
    await runtime.start();
    expect(upsert).toHaveBeenCalledOnce();

    const duplicate = createSchedulingRuntime({
      scheduler: { upsert, remove: async () => false },
      definitions: [definition, definition],
    });
    await expect(duplicate.start()).rejects.toThrow(
      "Duplicate schedule definition",
    );
  });

  it("rejects malformed cron expressions and unknown IANA timezones before BullMQ mutation", async () => {
    const upsertJobScheduler = vi.fn(async () => undefined);
    const scheduler = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      createQueue: () => ({
        upsertJobScheduler,
        removeJobScheduler: async () => true,
        close: async () => undefined,
      }),
    });
    const base = {
      scheduleId: "test.schedule",
      queue: "maintenance",
      name: "cleanup",
      data: {},
      pattern: {
        kind: "cron" as const,
        expression: "* * *",
        timezone: "Mars/Olympus",
      },
    };
    await expect(scheduler.upsert(base)).rejects.toThrow(
      "Schedule cron expression must contain five or six fields",
    );
    await expect(
      scheduler.upsert({
        ...base,
        pattern: { ...base.pattern, expression: "0 8 * * *" },
      }),
    ).rejects.toThrow("Invalid schedule timezone");
    expect(upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("recovers from a transient Redis upsert failure without corrupting queue ownership", async () => {
    const upsertJobScheduler = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue(undefined);
    const scheduler = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      createQueue: () => ({
        upsertJobScheduler,
        removeJobScheduler: async () => true,
        close: async () => undefined,
      }),
    });
    const definition = {
      scheduleId: "recovery.hourly",
      queue: "maintenance",
      name: "recover",
      data: {},
      pattern: { kind: "interval" as const, everyMs: 3_600_000 },
      options: { delayMs: 250 },
    };
    await expect(scheduler.upsert(definition)).rejects.toThrow("ECONNRESET");
    await expect(scheduler.upsert(definition)).resolves.toBeUndefined();
    expect(upsertJobScheduler).toHaveBeenLastCalledWith(
      "recovery.hourly",
      { every: 3_600_000 },
      expect.objectContaining({ opts: { delay: 250 } }),
    );
  });

  it("discovers a durable owner after restart so remove targets the original queue", async () => {
    const owners = new Map<string, string>();
    const registry: ScheduleOwnerRegistry = {
      listScheduleIds: async () => [...owners.keys()],
      get: async (scheduleId) => owners.get(scheduleId),
      async claim(scheduleId, queue) {
        const previous = owners.get(scheduleId);
        owners.set(scheduleId, queue);
        return previous;
      },
      async release(scheduleId, queue) {
        return owners.get(scheduleId) === queue && owners.delete(scheduleId);
      },
      async close() {
        /* durable state outlives a scheduler process */
      },
    };
    const removeJobScheduler = vi.fn(async () => true);
    const queue = {
      upsertJobScheduler: vi.fn(async () => undefined),
      removeJobScheduler,
      close: async () => undefined,
    };
    const first = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      ownerRegistry: registry,
      createQueue: () => queue,
    });
    await first.upsert({
      scheduleId: "restart.hourly",
      queue: "maintenance",
      name: "cleanup",
      data: {},
      pattern: { kind: "interval", everyMs: 3_600_000 },
    });

    const restarted = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      ownerRegistry: registry,
      createQueue: () => queue,
    });
    await first.close();
    await expect(restarted.listScheduleIds()).resolves.toEqual([
      "restart.hourly",
    ]);
    await expect(restarted.remove("restart.hourly")).resolves.toBe(true);
    expect(removeJobScheduler).toHaveBeenCalledWith("restart.hourly");
    expect(owners.has("restart.hourly")).toBe(false);
    await first.close();
    await restarted.close();
  });

  it("releases orphan owner entries when the scheduler was already removed", async () => {
    const registry = createInMemoryScheduleOwnerRegistry();
    await registry.claim("neon:old-schedule", "old-queue", "fence");
    const removeJobScheduler = vi.fn(async () => false);
    const createQueue = vi.fn(() => ({
      upsertJobScheduler: vi.fn(),
      removeJobScheduler,
      close: vi.fn(),
    }));
    const scheduler = createBullMqJobScheduler({
      redisUrl: "redis://localhost",
      ownerRegistry: registry,
      createQueue,
    });
    await expect(scheduler.listScheduleIds()).resolves.toEqual([
      "neon:old-schedule",
    ]);
    await expect(scheduler.remove("neon:old-schedule")).resolves.toBe(false);
    expect(createQueue).toHaveBeenCalledWith("old-queue", expect.any(Object));
    await expect(scheduler.listScheduleIds()).resolves.toEqual([]);
    await scheduler.close();
  });

  it("keeps owner entries discoverable when Redis scheduler removal fails", async () => {
    const registry = createInMemoryScheduleOwnerRegistry();
    await registry.claim("neon:old-schedule", "old-queue", "fence");
    const scheduler = createBullMqJobScheduler({
      redisUrl: "redis://localhost",
      ownerRegistry: registry,
      createQueue: () => ({
        upsertJobScheduler: vi.fn(),
        removeJobScheduler: async () => {
          throw new Error("Redis unavailable");
        },
        close: vi.fn(),
      }),
    });
    await expect(scheduler.remove("neon:old-schedule")).rejects.toThrow(
      "Redis unavailable",
    );
    await expect(scheduler.listScheduleIds()).resolves.toEqual([
      "neon:old-schedule",
    ]);
    await scheduler.close();
  });

  it("migrates durable queue ownership and preserves DST-aware IANA timezones", async () => {
    const upsertJobScheduler = vi.fn(async () => undefined);
    const removeJobScheduler = vi.fn(async () => true);
    const scheduler = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      createQueue: () => ({
        upsertJobScheduler,
        removeJobScheduler,
        close: async () => undefined,
      }),
    });
    await scheduler.upsert({
      scheduleId: "billing.local-midnight",
      queue: "billing",
      name: "close",
      data: {},
      pattern: {
        kind: "cron",
        expression: "0 0 * * *",
        timezone: "America/New_York",
      },
    });
    await expect(
      scheduler.upsert({
        scheduleId: "billing.local-midnight",
        queue: "other",
        name: "close",
        data: {},
        pattern: {
          kind: "cron",
          expression: "0 0 * * *",
          timezone: "America/New_York",
        },
      }),
    ).resolves.toBeUndefined();
    expect(removeJobScheduler).toHaveBeenCalledWith("billing.local-midnight");
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "billing.local-midnight",
      { pattern: "0 0 * * *", tz: "America/New_York" },
      expect.any(Object),
    );
  });

  it("waits for a previous lease during a bounded restart without writing before acquisition", async () => {
    vi.useFakeTimers();
    const acquire = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const upsertJobScheduler = vi.fn(async () => undefined);
    const scheduler = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      leaderAcquireTimeoutMs: 1000,
      leaderLease: {
        ownerId: "next",
        leaseKey: "test:leader",
        fencingToken: "next:2",
        acquire,
        assertLeadership: async () => undefined,
        release: async () => undefined,
        close: async () => undefined,
      },
      createQueue: () => ({
        upsertJobScheduler,
        removeJobScheduler: async () => true,
        close: async () => undefined,
      }),
    });
    try {
      const pending = scheduler.upsert({
        scheduleId: "restart.hourly",
        queue: "maintenance",
        name: "restart",
        data: {},
        pattern: { kind: "interval", everyMs: 3600000 },
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(upsertJobScheduler).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      await pending;
      expect(upsertJobScheduler).toHaveBeenCalledOnce();
    } finally {
      await scheduler.close();
      vi.useRealTimers();
    }
  });

  it("fences mutations to the Redis lease owner and releases leadership on close", async () => {
    const acquire = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const closeLease = vi.fn(async () => undefined);
    const upsertJobScheduler = vi.fn(async () => undefined);
    const scheduler = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      leaderLease: {
        ownerId: "scheduler-a",
        leaseKey: "test:leader",
        get fencingToken() {
          return "scheduler-a:1";
        },
        acquire,
        assertLeadership: async () => undefined,
        release: async () => undefined,
        close: closeLease,
      },
      createQueue: () => ({
        upsertJobScheduler,
        removeJobScheduler: async () => true,
        close: async () => undefined,
      }),
    });
    const definition = {
      scheduleId: "leader.hourly",
      queue: "maintenance",
      name: "leader",
      data: {},
      pattern: { kind: "interval" as const, everyMs: 3_600_000 },
    };
    await expect(scheduler.upsert(definition)).rejects.toThrow(
      "does not own the leader lease",
    );
    await expect(scheduler.upsert(definition)).resolves.toBeUndefined();
    expect(upsertJobScheduler).toHaveBeenCalledOnce();
    await scheduler.close();
    expect(closeLease).toHaveBeenCalledOnce();
  });

  it("reports schedule drift before repairing it after a scheduler restart", async () => {
    const definition = {
      scheduleId: "reports.hourly",
      queue: "reports",
      name: "generate",
      data: {},
      pattern: {
        kind: "cron" as const,
        expression: "0 * * * *",
        timezone: "UTC",
      },
    };
    const upsertJobScheduler = vi
      .fn()
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValue(undefined);
    const getJobScheduler = vi.fn(async () => ({
      name: "old-generate",
      pattern: "30 * * * *",
      tz: "UTC",
      next: Date.parse("2026-08-12T10:30:00.000Z"),
    }));
    const queue = {
      upsertJobScheduler,
      getJobScheduler,
      removeJobScheduler: async () => true,
      close: async () => undefined,
    };
    const firstProcess = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      createQueue: () => queue,
    });
    await expect(firstProcess.upsert(definition)).rejects.toThrow(
      "Redis unavailable",
    );
    await firstProcess.close();

    const drift = vi.fn();
    const restarted = createBullMqJobScheduler({
      redisUrl: "redis://localhost/3",
      createQueue: () => queue,
    });
    const runtime = createSchedulingRuntime({
      scheduler: restarted,
      definitions: [definition],
      onDrift: drift,
    });
    await expect(runtime.start()).resolves.toBeUndefined();
    expect(drift).toHaveBeenCalledWith({
      scheduleId: "reports.hourly",
      queue: "reports",
      status: "drifted",
      differences: [
        "name:old-generate->generate",
        "pattern:30 * * * *->0 * * * *",
      ],
      observedNextRunAt: "2026-08-12T10:30:00.000Z",
    });
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
    await restarted.close();
  });

  it("qualifies Redis outage lease loss and restart takeover", async () => {
    const state: {
      owner?: string;
      expiresAt?: number;
      outage: boolean;
      generation: number;
    } = { outage: false, generation: 0 };
    const connection = () => ({
      client: Promise.resolve({
        async eval(
          script: string,
          _keys: number,
          _key: string,
          ...args: Array<string | number>
        ) {
          if (state.outage) throw new Error("ECONNREFUSED");
          if (script.includes("psetex")) {
            if (state.owner && (state.expiresAt ?? 0) > Date.now()) return "";
            state.generation += 1;
            state.owner = `${String(args[1])}:${state.generation}`;
            state.expiresAt = Date.now() + Number(args[2]);
            return state.owner;
          }
          const token = String(args[0]);
          if (state.owner !== token || (state.expiresAt ?? 0) <= Date.now())
            return 0;
          if (script.includes("pexpire"))
            state.expiresAt = Date.now() + Number(args[1]);
          else {
            delete state.owner;
            delete state.expiresAt;
          }
          return 1;
        },
      }),
      close: vi.fn(async () => undefined),
    });
    const lost = vi.fn();
    const first = createRedisSchedulerLeaderLease("redis://unused", {
      ownerId: "scheduler-a",
      ttlMs: 3_000,
      renewIntervalMs: 1_000,
      connection: connection(),
      onLeadershipLost: lost,
    });
    const restarted = createRedisSchedulerLeaderLease("redis://unused", {
      ownerId: "scheduler-b",
      ttlMs: 3_000,
      renewIntervalMs: 1_000,
      connection: connection(),
    });
    await expect(first.acquire()).resolves.toBe(true);
    expect(first.fencingToken).toBe("scheduler-a:1");
    await expect(restarted.acquire()).resolves.toBe(false);
    state.outage = true;
    await expect(first.assertLeadership()).rejects.toThrow(
      "does not own the leader lease",
    );
    expect(lost).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ECONNREFUSED" }),
    );
    state.outage = false;
    state.expiresAt = 0;
    await expect(restarted.acquire()).resolves.toBe(true);
    expect(restarted.fencingToken).toBe("scheduler-b:2");
    await restarted.close();
    await first.close();
    expect(state.owner).toBeUndefined();
  });
});
