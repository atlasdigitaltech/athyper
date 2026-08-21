import { describe, expect, it, vi } from "vitest";

import { createBullMqConnectionOptions, createBullMqJobRuntime, createDeterministicEnqueueId } from "../index.js";

describe("BullMQ job runtime", () => {
  it("uses BullMQ-safe Redis connection settings", () => {
    expect(createBullMqConnectionOptions("rediss://worker:secret@redis.example:6381/4")).toEqual({
      host: "redis.example",
      port: 6381,
      username: "worker",
      password: "secret",
      db: 4,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });

  it("publishes canonical options and dispatches a registered handler", async () => {
    const add = vi.fn(async () => ({ id: "job-42" }));
    const closeQueue = vi.fn(async () => undefined);
    const closeWorker = vi.fn(async () => undefined);
    let processor: ((job: any) => Promise<unknown>) | undefined;
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost:6379/2",
      concurrency: 3,
      createQueue: () => ({ add, close: closeQueue }),
      createWorker: (_queue, value, options) => {
        expect(options.concurrency).toBe(3);
        processor = value;
        return { close: closeWorker };
      },
    });
    const handle = vi.fn(async (_job, context) => {
      await context.reportProgress(50);
      return { status: "completed" as const };
    });
    runtime.register("notifications", "deliver", { handle });

    await expect(runtime.enqueue("notifications", "deliver", { notificationId: "n-1" }, {
      jobId: "delivery-1",
      maxAttempts: 4,
      delayMs: 250,
    })).resolves.toBe("job-42");
    expect(add).toHaveBeenCalledWith("deliver", { notificationId: "n-1" }, {
      jobId: "delivery-1",
      attempts: 4,
      delay: 250,
    });

    await runtime.start();
    const updateProgress = vi.fn(async () => undefined);
    await processor?.({
      id: "job-42",
      name: "deliver",
      data: { notificationId: "n-1" },
      attemptsMade: 1,
      timestamp: Date.parse("2026-08-09T00:00:00.000Z"),
      opts: { attempts: 4, jobId: "delivery-1" },
      updateProgress,
    });
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2, maxAttempts: 4, idempotencyKey: "delivery-1" }),
      expect.objectContaining({ attempt: 2 }),
    );
    expect(updateProgress).toHaveBeenCalledWith(50);

    await runtime.close();
    expect(closeWorker).toHaveBeenCalledOnce();
    expect(closeQueue).toHaveBeenCalledOnce();
  });

  it("rejects duplicate handlers and late registration", async () => {
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost",
      createWorker: () => ({ close: async () => undefined }),
    });
    const handler = { handle: async () => undefined };
    runtime.register("jobs", "run", handler);
    expect(() => runtime.register("jobs", "run", handler)).toThrow("already registered");
    await runtime.start();
    expect(() => runtime.register("jobs", "later", handler)).toThrow("before the runtime starts");
    await runtime.close();
  });

  it("propagates governed execution context and lifecycle evidence", async () => {
    const lifecycle = {
      enqueued: vi.fn(async () => undefined),
      started: vi.fn(async () => undefined),
      completed: vi.fn(async () => undefined),
      failed: vi.fn(async () => undefined),
    };
    let processor: ((job: any) => Promise<unknown>) | undefined;
    let storedData: unknown;
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost:6379/2",
      lifecycle,
      createQueue: () => ({
        add: async (_name, data) => { storedData = data; return { id: "job-7" }; },
        close: async () => undefined,
      }),
      createWorker: (_queue, value) => {
        processor = value;
        return { close: async () => undefined };
      },
    });
    const handle = vi.fn(async (job) => {
      expect(job.execution).toMatchObject({ planeKey: "neon", tenantId: "tenant-7" });
      return { status: "completed" as const };
    });
    runtime.register("records", "reindex", { handle });
    await runtime.enqueue("records", "reindex", { recordId: "record-7" }, {
      jobId: "reindex-7",
      maxAttempts: 3,
      timeoutMs: 5_000,
      execution: {
        planeKey: "neon",
        scope: "tenant",
        tenantId: "tenant-7",
        principalId: "principal-7",
        correlationId: "correlation-7",
      },
      subject: { entityCode: "finance.invoice", recordId: "record-7" },
      payloadSchema: { name: "records.reindex", version: 1 },
    });
    await runtime.start();
    await processor?.({
      id: "job-7",
      name: "reindex",
      data: storedData,
      attemptsMade: 0,
      timestamp: Date.parse("2026-08-09T00:00:00.000Z"),
      opts: { attempts: 3, jobId: "reindex-7" },
      updateProgress: async () => undefined,
    });
    expect(lifecycle.enqueued).toHaveBeenCalledWith(expect.objectContaining({ executionKey: "reindex-7" }));
    expect(lifecycle.started).toHaveBeenCalledOnce();
    expect(lifecycle.completed).toHaveBeenCalledOnce();
    expect(lifecycle.failed).not.toHaveBeenCalled();
    await runtime.close();
  });

  it("exposes governed cancellation and failed-job retry controls", async () => {
    const remove = vi.fn(async () => undefined);
    const retry = vi.fn(async () => undefined);
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost:6379/2",
      createQueue: () => ({
        add: async () => ({ id: "job-1" }),
        getJob: async (jobId) => jobId === "job-1" ? { remove, retry } : undefined,
        close: async () => undefined,
      }),
    });
    await expect(runtime.cancel("notifications", "job-1")).resolves.toBe(true);
    await expect(runtime.retry("notifications", "job-1")).resolves.toBe(true);
    await expect(runtime.retry("notifications", "missing")).resolves.toBe(false);
    expect(remove).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith("failed");
    await runtime.close();
  });

  it("derives BullMQ-safe deterministic enqueue ids from semantic keys", async () => {
    const add = vi.fn(async (_name, _data, options) => ({ id: String(options.jobId) }));
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost/2",
      createQueue: () => ({ add, close: async () => undefined }),
    });
    const expected = createDeterministicEnqueueId("billing", "settle", "invoice:42");
    await expect(runtime.enqueue("billing", "settle", { invoiceId: "42" }, {
      enqueueKey: "invoice:42",
    })).resolves.toBe(expected);
    expect(expected).toMatch(/^athyper-[a-f0-9]{64}$/);
    expect(add).toHaveBeenCalledWith("settle", { invoiceId: "42" }, { jobId: expected });
    await expect(runtime.enqueue("billing", "settle", {}, {
      jobId: "manual",
      enqueueKey: "semantic",
    })).rejects.toThrow("mutually exclusive");
    await runtime.close();
  });

  it("lists failed jobs and replays them with a deterministic administration key", async () => {
    const add = vi.fn(async (_name, _data, options) => ({ id: String(options.jobId) }));
    const failed = {
      id: "failed-7",
      name: "deliver",
      data: { notificationId: "n-7" },
      opts: { attempts: 5, removeOnFail: false },
      attemptsMade: 5,
      failedReason: "provider unavailable",
      remove: async () => undefined,
      retry: async () => undefined,
      getState: async () => "failed",
    };
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost/2",
      createQueue: () => ({
        add,
        getJob: async (id) => id === failed.id ? failed : undefined,
        getJobs: async () => [failed],
        close: async () => undefined,
      }),
    });
    await expect(runtime.listDeadLetters("notifications")).resolves.toEqual([{
      jobId: "failed-7",
      queue: "notifications",
      name: "deliver",
      attemptsMade: 5,
      failureReason: "provider unavailable",
    }]);
    const expected = createDeterministicEnqueueId(
      "notifications",
      "deliver",
      "replay:failed-7:operator-command-9",
    );
    await expect(runtime.replayDeadLetter(
      "notifications",
      "failed-7",
      "operator-command-9",
    )).resolves.toBe(expected);
    expect(add).toHaveBeenCalledWith("deliver", failed.data, {
      attempts: 5,
      removeOnFail: false,
      jobId: expected,
    });
    await runtime.close();
  });
});
