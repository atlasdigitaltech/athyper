import { describe, expect, it, vi } from "vitest";

import { createBullMqJobScheduler, createSchedulingRuntime } from "../index.js";

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
      pattern: { kind: "cron", expression: "0 8 * * *", timezone: "Asia/Kuala_Lumpur" },
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
    await expect(duplicate.start()).rejects.toThrow("Duplicate schedule definition");
  });

  it("rejects malformed cron expressions and unknown IANA timezones before BullMQ mutation", async () => {
    const upsertJobScheduler = vi.fn(async () => undefined);
    const scheduler = createBullMqJobScheduler({ redisUrl: "redis://localhost/3", createQueue: () => ({ upsertJobScheduler, removeJobScheduler: async () => true, close: async () => undefined }) });
    const base = { scheduleId: "test.schedule", queue: "maintenance", name: "cleanup", data: {}, pattern: { kind: "cron" as const, expression: "* * *", timezone: "Mars/Olympus" } };
    await expect(scheduler.upsert(base)).rejects.toThrow("Schedule cron expression must contain five or six fields");
    await expect(scheduler.upsert({ ...base, pattern: { ...base.pattern, expression: "0 8 * * *" } })).rejects.toThrow("Invalid schedule timezone");
    expect(upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("recovers from a transient Redis upsert failure without corrupting queue ownership", async () => {
    const upsertJobScheduler = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue(undefined);
    const scheduler = createBullMqJobScheduler({ redisUrl: "redis://localhost/3", createQueue: () => ({ upsertJobScheduler, removeJobScheduler: async () => true, close: async () => undefined }) });
    const definition = { scheduleId: "recovery.hourly", queue: "maintenance", name: "recover", data: {}, pattern: { kind: "interval" as const, everyMs: 3_600_000 }, options: { delayMs: 250 } };
    await expect(scheduler.upsert(definition)).rejects.toThrow("ECONNRESET");
    await expect(scheduler.upsert(definition)).resolves.toBeUndefined();
    expect(upsertJobScheduler).toHaveBeenLastCalledWith("recovery.hourly", { every: 3_600_000 }, expect.objectContaining({ opts: { delay: 250 } }));
  });

  it("enforces single queue ownership and preserves DST-aware IANA timezones", async () => {
    const upsertJobScheduler = vi.fn(async () => undefined);
    const scheduler = createBullMqJobScheduler({ redisUrl: "redis://localhost/3", createQueue: () => ({ upsertJobScheduler, removeJobScheduler: async () => true, close: async () => undefined }) });
    await scheduler.upsert({ scheduleId: "billing.local-midnight", queue: "billing", name: "close", data: {}, pattern: { kind: "cron", expression: "0 0 * * *", timezone: "America/New_York" } });
    await expect(scheduler.upsert({ scheduleId: "billing.local-midnight", queue: "other", name: "close", data: {}, pattern: { kind: "cron", expression: "0 0 * * *", timezone: "America/New_York" } })).rejects.toThrow("already owned by queue billing");
    expect(upsertJobScheduler).toHaveBeenCalledWith("billing.local-midnight", { pattern: "0 0 * * *", tz: "America/New_York" }, expect.any(Object));
  });
});
