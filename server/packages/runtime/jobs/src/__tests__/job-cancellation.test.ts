import { describe, expect, it, vi } from "vitest";
import { createRedisJobCancellationTransport, type CancellationRedisClient } from "../job-cancellation.js";
import { createBullMqJobRuntime, type BullMqJobLike } from "../bullmq-job-runtime.js";

function broker() {
  const clients = new Set<{ channels: Set<string>; listener?: (channel: string, message: string) => void }>();
  return () => {
    const state: { channels: Set<string>; listener?: (channel: string, message: string) => void } = { channels: new Set() };
    clients.add(state);
    const client: CancellationRedisClient = {
      subscribe: async (channel) => { state.channels.add(channel); },
      publish: async (channel, message) => { for (const target of clients) if (target.channels.has(channel)) target.listener?.(channel, message); },
      on: (_event, listener) => { state.listener = listener; },
      off: () => { delete state.listener; },
    };
    return { client: Promise.resolve(client), close: async () => { clients.delete(state); } };
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((value) => { resolve = value; });
  return { promise, resolve };
}

describe("cross-process cancellation", () => {
  it("waits for the owning worker to record cancellation and makes it unrecoverable", async () => {
    const createConnection = broker();
    const transport = () => createRedisJobCancellationTransport("redis://localhost/2", { createConnection, timeoutMs: 1000 });
    const entered = deferred<void>();
    const recording = deferred<void>();
    const commit = deferred<void>();
    let signal: AbortSignal | undefined;
    let processor: ((job: BullMqJobLike) => Promise<unknown>) | undefined;
    const failed = vi.fn(async () => { recording.resolve(); await commit.promise; });
    const worker = createBullMqJobRuntime({
      redisUrl: "redis://localhost/2", cancellationTransport: transport(),
      lifecycle: { enqueued: vi.fn(), started: vi.fn(), completed: vi.fn(), failed },
      createWorker: (_queue, value) => { processor = value; return { close: async () => undefined }; },
    });
    worker.register("reports", "generate", { handle: async (_job, context) => {
      signal = context.signal; entered.resolve();
      return new Promise<void>((_resolve, reject) => context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true }));
    } });
    const remove = vi.fn();
    const api = createBullMqJobRuntime({
      redisUrl: "redis://localhost/2", cancellationTransport: transport(),
      createQueue: () => ({ add: vi.fn(), close: vi.fn(), getJob: async () => ({ remove, retry: vi.fn(), attemptsMade: 0, getState: async () => "active" }) }),
    });
    try {
      await worker.start();
      const run = processor!({ id: "job-1", name: "generate", data: {}, attemptsMade: 0, opts: { attempts: 5 }, timestamp: Date.now(), updateProgress: vi.fn() }).catch((error: unknown) => error);
      await entered.promise;
      const stale = createRedisJobCancellationTransport("redis://localhost/2", { createConnection, timeoutMs: 20 });
      try { await expect(stale.request("reports", "job-1", 2)).resolves.toBe(false); }
      finally { await stale.close(); }
      expect(signal?.aborted).toBe(false);
      let accepted = false;
      const cancel = api.cancel("reports", "job-1").then((value) => { accepted = value; return value; });
      await recording.promise;
      expect(signal?.aborted).toBe(true);
      expect(accepted).toBe(false);
      commit.resolve();
      await expect(cancel).resolves.toBe(true);
      expect(await run).toMatchObject({ name: "UnrecoverableError" });
      expect(failed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ disposition: "cancelled", code: "JOB_CANCELLED" }));
      expect(remove).not.toHaveBeenCalled();
    } finally { commit.resolve(); await api.close(); await worker.close(); }
  });

  it("times out without a matching owner and isolates Redis databases", async () => {
    const createConnection = broker();
    const owner = createRedisJobCancellationTransport("redis://localhost/1", { createConnection, timeoutMs: 20 });
    const api = createRedisJobCancellationTransport("redis://localhost/2", { createConnection, timeoutMs: 20 });
    const handler = vi.fn(async () => true);
    try {
      await owner.listen(handler);
      await expect(api.request("reports", "job-1", 1)).resolves.toBe(false);
      expect(handler).not.toHaveBeenCalled();
    } finally { await api.close(); await owner.close(); }
  });

  it("ignores non-owners and resolves pending requests when closed", async () => {
    const createConnection = broker();
    const owner = createRedisJobCancellationTransport("redis://localhost/2", { createConnection, timeoutMs: 20 });
    const api = createRedisJobCancellationTransport("redis://localhost/2", { createConnection, timeoutMs: 20 });
    try {
      await owner.listen(async () => false);
      await expect(api.request("reports", "job-1", 1)).resolves.toBe(false);
      const pending = api.request("reports", "job-2", 1);
      await new Promise<void>((resolve) => setImmediate(resolve));
      await api.close();
      await expect(pending).resolves.toBe(false);
    } finally { await api.close(); await owner.close(); }
  });

  it.each(["completed", "failed", "unknown", "waiting-children"])("rejects cancellation in state %s without removing evidence", async (state) => {
    const remove = vi.fn();
    const request = vi.fn();
    const runtime = createBullMqJobRuntime({ redisUrl: "redis://localhost", cancellationTransport: { request, listen: vi.fn(), close: vi.fn() },
      createQueue: () => ({ add: vi.fn(), close: vi.fn(), getJob: async () => ({ remove, retry: vi.fn(), getState: async () => state }) }),
    });
    try { await expect(runtime.cancel("reports", "job-1")).resolves.toBe(false); expect(remove).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled(); }
    finally { await runtime.close(); }
  });

  it("delivers cancellation if a queued job becomes active before removal", async () => {
    const request = vi.fn(async () => true);
    const getState = vi.fn().mockResolvedValueOnce("waiting").mockResolvedValue("active");
    const runtime = createBullMqJobRuntime({ redisUrl: "redis://localhost", cancellationTransport: { request, listen: vi.fn(), close: vi.fn() },
      createQueue: () => ({ add: vi.fn(), close: vi.fn(), getJob: async () => ({ attemptsMade: 2, retry: vi.fn(), getState, remove: async () => { throw new Error("locked"); } }) }),
    });
    try { await expect(runtime.cancel("reports", "job-1")).resolves.toBe(true); expect(request).toHaveBeenCalledWith("reports", "job-1", 3); }
    finally { await runtime.close(); }
  });
});
