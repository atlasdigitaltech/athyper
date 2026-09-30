import { describe, expect, it, vi } from "vitest";
import {
  createInvalidationWorker,
  type InvalidationMessage,
} from "../index.js";
const message: InvalidationMessage = {
  id: "10000000-0000-4000-8000-000000000001",
  kind: "metadata",
  planeKey: "neon",
  tenantId: "20000000-0000-4000-8000-000000000001",
  scopeKey: "invoice",
  payload: { entityCode: "invoice", token: "must-not-leak" },
  createdAt: "2026-08-10T00:00:00.000Z",
  attemptCount: 1,
};
describe("durable invalidation worker", () => {
  it("increments idempotently and completes a leased row", async () => {
    let calls = 0;
    const complete = vi.fn(async () => true);
    const worker = createInvalidationWorker({
      workerId: "worker-1",
      repository: {
        claim: async () => (calls++ === 0 ? [message] : []),
        complete,
        fail: async () => true,
        backlog: async () => ({ pending: 0, oldestCreatedAt: null }),
      },
      generations: { incrementOnce: async () => 4 },
      now: () => Date.parse("2026-08-10T00:00:01Z"),
    });
    await worker.drain();
    expect(complete).toHaveBeenCalledWith(message.id, "worker-1", 4);
  });
  it("dead letters poison payloads without secrets", async () => {
    let calls = 0;
    const fail = vi.fn(async () => true);
    const worker = createInvalidationWorker({
      workerId: "worker-1",
      repository: {
        claim: async () =>
          calls++ === 0 ? [{ ...message, scopeKey: "bad scope" }] : [],
        complete: async () => true,
        fail,
        backlog: async () => ({ pending: 0, oldestCreatedAt: null }),
      },
      generations: { incrementOnce: async () => 1 },
    });
    await worker.drain();
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({
        deadLetter: true,
        sanitizedPayload: { entityCode: "invoice" },
      }),
    );
  });
});

it("reports background drain failures and continues polling", async () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  const claim = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error("dead-letter insert failed"))
    .mockResolvedValue([]);
  const worker = createInvalidationWorker({
    workerId: "worker-1",
    pollIntervalMs: 250,
    onError,
    repository: {
      claim,
      complete: async () => true,
      fail: async () => true,
      backlog: async () => ({ pending: 0, oldestCreatedAt: null }),
    },
    generations: { incrementOnce: async () => 1 },
  });
  try {
    await worker.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "dead-letter insert failed" }),
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(claim).toHaveBeenCalledTimes(3);
  } finally {
    await worker.close();
    vi.useRealTimers();
  }
});
