import type { EnqueueOptions, JobEnvelope, JobExecutionLifecycle } from "@athyper/server-contract-jobs";
import type { BullMqJobLike } from "../bullmq-job-runtime.js";
import { describe, expect, it, vi } from "vitest";

import { createBullMqConnectionOptions, createBullMqJobRuntime as createRuntime, type BullMqJobRuntimeOptions, createDeterministicEnqueueId } from "../index.js";

const createBullMqJobRuntime = (options: BullMqJobRuntimeOptions) => createRuntime({ cancellationTransport: false, ...options });

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
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
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
    expect(lifecycle.enqueued).toHaveBeenCalledWith(expect.objectContaining({ executionKey: "records:reindex-7" }));
    expect(lifecycle.started).toHaveBeenCalledOnce();
    expect(lifecycle.completed).toHaveBeenCalledOnce();
    expect(lifecycle.failed).not.toHaveBeenCalled();
    await runtime.close();
  });

  it("classifies explicitly non-retryable domain failures as permanent", async () => {
    const failed = vi.fn(async () => undefined);
    let processor: ((job: any) => Promise<unknown>) | undefined;
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost:6379/2",
      lifecycle: {
        enqueued: async () => undefined,
        started: async () => undefined,
        completed: async () => undefined,
        failed,
      },
      createWorker: (_queue, value) => {
        processor = value;
        return { close: async () => undefined };
      },
    });
    runtime.register("records", "export", { handle: async () => {
      throw Object.assign(new Error("Unsupported export format"), {
        code: "EXPORT_FORMAT_UNSUPPORTED",
        retryable: false,
      });
    } });
    await runtime.start();
    await expect(processor?.({
      id: "job-8",
      name: "export",
      data: {},
      attemptsMade: 0,
      timestamp: Date.parse("2026-08-09T00:00:00.000Z"),
      opts: { attempts: 5 },
      updateProgress: async () => undefined,
    })).rejects.toThrow("Unsupported export format");
    expect(failed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      code: "EXPORT_FORMAT_UNSUPPORTED",
      disposition: "permanent",
    }));
    await runtime.close();
  });

  it("exposes governed cancellation and failed-job retry controls", async () => {
    const getState = vi.fn().mockResolvedValueOnce("waiting").mockResolvedValue("failed");
    const remove = vi.fn(async () => undefined);
    const retry = vi.fn(async () => undefined);
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost:6379/2",
      createQueue: () => ({
        add: async () => ({ id: "job-1" }),
        getJob: async (jobId) => jobId === "job-1" ? { remove, retry, getState } : undefined,
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

  it.each(["completed", "active", "waiting", "delayed", "unknown"])("rejects retry of a %s job", async (state) => {
    const retry = vi.fn();
    const runtime = createBullMqJobRuntime({ redisUrl: "redis://localhost", createQueue: () => ({ add: vi.fn(), close: vi.fn(), getJob: async () => ({ retry, remove: vi.fn(), getState: async () => state }) }) });
    try { await expect(runtime.retry("reports", "job-1")).resolves.toBe(false); expect(retry).not.toHaveBeenCalled(); }
    finally { await runtime.close(); }
  });

  it("returns a conflict when another retry wins the state race", async () => {
    const getState = vi.fn().mockResolvedValueOnce("failed").mockResolvedValue("waiting");
    const runtime = createBullMqJobRuntime({ redisUrl: "redis://localhost", createQueue: () => ({ add: vi.fn(), close: vi.fn(), getJob: async () => ({ getState, remove: vi.fn(), retry: async () => { throw new Error("Job is not failed"); } }) }) });
    try { await expect(runtime.retry("reports", "job-1")).resolves.toBe(false); }
    finally { await runtime.close(); }
  });

  it("admits repeated manual retries after exhaustion without resetting attempt history", async () => {
    let processor: ((job: BullMqJobLike) => Promise<unknown>) | undefined;
    let attemptsMade = 3;
    let state = "failed";
    const history = new Map<number, string>([[1, "retrying"], [2, "retrying"], [3, "dead_letter"]]);
    const started = vi.fn(async (job: JobEnvelope) => {
      // Mirror the database constraint that previously prevented handler execution.
      if (job.attempt > job.maxAttempts) throw new Error("job_execution_attempt_chk");
    });
    const failed = vi.fn(async (job: JobEnvelope) => { history.set(job.attempt, "dead_letter"); });
    const completed = vi.fn(async (job: JobEnvelope) => { history.set(job.attempt, "succeeded"); });
    const retry = vi.fn(async () => {
      if (state !== "failed") throw new Error("Job is not failed");
      state = "waiting";
      // Like BullMQ retry('failed'), preserve the cumulative attempt count.
    });
    const runtime = createBullMqJobRuntime({
      redisUrl: "redis://localhost/2",
      lifecycle: { enqueued: async () => undefined, started, failed, completed },
      createQueue: () => ({ add: async () => ({ id: "job-1" }), close: async () => undefined,
        getJob: async () => ({ retry, remove: async () => undefined }),
      }),
      createWorker: (_queue, value) => { processor = value; return { close: async () => undefined }; },
    });
    const handle = vi.fn(async (job: JobEnvelope) => {
      if (job.attempt === 4) throw new Error("Still unavailable");
      return { status: "completed" as const };
    });
    runtime.register("reports", "generate", { handle });
    const job = (): BullMqJobLike => ({
      id: "job-1", name: "generate", data: {}, attemptsMade,
      opts: { attempts: 3, jobId: "job-1" }, timestamp: Date.now(), updateProgress: async () => undefined,
    });
    try {
      await runtime.start();
      await expect(runtime.retry("reports", "job-1")).resolves.toBe(true);
      await expect(processor!(job())).rejects.toThrow("Still unavailable");
      expect(started).toHaveBeenLastCalledWith(expect.objectContaining({ attempt: 4, maxAttempts: 4 }));
      expect(failed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ disposition: "permanent" }));
      attemptsMade += 1;
      state = "failed";
      await expect(runtime.retry("reports", "job-1")).resolves.toBe(true);
      await processor!(job());
      expect(started).toHaveBeenLastCalledWith(expect.objectContaining({ attempt: 5, maxAttempts: 5 }));
      expect(handle).toHaveBeenCalledTimes(2);
      expect(completed).toHaveBeenCalledOnce();
      expect(retry.mock.calls).toEqual([["failed"], ["failed"]]);
      expect([...history.entries()]).toEqual([[1, "retrying"], [2, "retrying"], [3, "dead_letter"], [4, "dead_letter"], [5, "succeeded"]]);
    } finally {
      await runtime.close();
    }
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
    expect(add).toHaveBeenCalledWith("settle", { invoiceId: "42" }, { jobId: expected, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 5000 } });
    await expect(runtime.enqueue("billing", "settle", {}, {
      jobId: "manual",
      enqueueKey: "semantic",
    })).rejects.toThrow("mutually exclusive");
    await runtime.close();
  });

  it.each([
    { label: "semantic enqueue key", options: { enqueueKey: "invoice:42" } },
    { label: "administration replay key", options: { enqueueKey: "replay:source-execution:11111111-1111-4111-8111-111111111111" } },
    { label: "explicit job ID", options: { jobId: "manual-42" } },
    { label: "generated job ID", options: {} },
  ] satisfies { label: string; options: EnqueueOptions }[])(
    "uses one durable execution across enqueue, failure, retry and completion for $label",
    async ({ options }) => {
      const rows = new Map<string, string>();
      const keys: string[] = [];
      const record = (key: string, status: string) => {
        keys.push(key);
        rows.set(key, status);
      };
      const keyFor = (job: JobEnvelope) => job.executionKey ?? job.idempotencyKey ?? job.id;
      const lifecycle: JobExecutionLifecycle = {
        enqueued: async (input) => { record(input.executionKey, "queued"); },
        started: async (job) => { record(keyFor(job), "running"); },
        failed: async (job) => { record(keyFor(job), "retrying"); },
        completed: async (job) => { record(keyFor(job), "succeeded"); },
      };
      let storedJob: BullMqJobLike | undefined;
      const publisher = createBullMqJobRuntime({
        redisUrl: "redis://localhost/2", lifecycle,
        createQueue: () => ({
          add: async (name, data, opts) => {
            const id = opts.jobId ?? "generated-42";
            storedJob = { id, name, data, opts, attemptsMade: 0, timestamp: Date.now(), updateProgress: async () => undefined };
            return { id };
          },
          close: async () => undefined,
        }),
      });
      const publishedId = await publisher.enqueue("billing", "settle", { invoiceId: "42" }, {
        ...options, maxAttempts: 2,
        execution: { planeKey: "neon", scope: "tenant", tenantId: "tenant-1", principalId: "principal-1" },
      });
      expect([...rows.entries()]).toEqual([[`billing:${publishedId}`, "queued"]]);
      await publisher.close();

      // Consume only the persisted BullMQ data in a separate runtime, as in production.
      let processor: ((job: BullMqJobLike) => Promise<unknown>) | undefined;
      const worker = createBullMqJobRuntime({
        redisUrl: "redis://localhost/2", lifecycle,
        createWorker: (_queue, value) => { processor = value; return { close: async () => undefined }; },
      });
      worker.register("billing", "settle", {
        handle: async (job) => {
          if (job.attempt === 1) throw new Error("Temporary failure");
          return { status: "completed" };
        },
      });
      try {
        await worker.start();
        expect(processor).toBeDefined();
        expect(storedJob).toBeDefined();
        await expect(processor!(storedJob!)).rejects.toThrow("Temporary failure");
        await processor!({ ...storedJob!, attemptsMade: 1 });
        expect(keys).toEqual(Array(5).fill(`billing:${publishedId}`));
        expect([...rows.entries()]).toEqual([[`billing:${publishedId}`, "succeeded"]]);
      } finally {
        await worker.close();
      }
    },
  );

  it("keeps identical BullMQ IDs in different queues as separate durable executions", async () => {
    const enqueued: string[] = [];
    const started: string[] = [];
    const processors = new Map<string, (job: BullMqJobLike) => Promise<unknown>>();
    const runtime = createBullMqJobRuntime({ redisUrl: "redis://localhost",
      lifecycle: { enqueued: async (input) => { enqueued.push(input.executionKey); }, started: async (job) => { started.push(job.executionKey!); }, failed: vi.fn(), completed: vi.fn() },
      createQueue: () => ({ add: async () => ({ id: "1" }), close: vi.fn() }),
      createWorker: (queue, processor) => { processors.set(queue, processor); return { close: vi.fn() }; },
    });
    try {
      for (const queue of ["reports", "notifications"]) {
        runtime.register(queue, "run", { handle: async () => undefined });
        await runtime.enqueue(queue, "run", {});
      }
      await runtime.start();
      for (const processor of processors.values()) await processor({ id: "1", name: "run", data: {}, opts: {}, attemptsMade: 0, timestamp: Date.now(), updateProgress: vi.fn() });
      expect(enqueued).toEqual(["reports:1", "notifications:1"]);
      expect(started).toEqual(enqueued);
    } finally { await runtime.close(); }
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
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
      jobId: expected,
    });
    await runtime.close();
  });
});
