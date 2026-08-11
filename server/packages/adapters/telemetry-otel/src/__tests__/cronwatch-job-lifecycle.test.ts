import { describe, expect, it, vi } from "vitest";

import { createCronwatchJobLifecycle } from "../index.js";

describe("Cronwatch job lifecycle", () => {
  it("reports start, success and failure without replacing durable lifecycle evidence", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }));
    const delegate = {
      enqueued: vi.fn(async () => undefined),
      started: vi.fn(async () => undefined),
      completed: vi.fn(async () => undefined),
      failed: vi.fn(async () => undefined),
    };
    const lifecycle = createCronwatchJobLifecycle({
      baseUrl: "http://cronwatch:8000/ping/",
      pingKey: "project-ping-key",
      fetch: fetch as typeof globalThis.fetch,
      delegate,
    });
    const job = {
      id: "job-1", name: "notifications.discover-work", queue: "notifications.maintenance",
      data: {}, attempt: 1, maxAttempts: 3, enqueuedAt: new Date().toISOString(),
    };
    await lifecycle.started(job);
    await lifecycle.completed(job, { status: "completed" });
    await lifecycle.failed(job, { disposition: "permanent", code: "FAILED", message: "failed" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "http://cronwatch:8000/ping/project-ping-key/notifications-maintenance-notifications-discover-work/start",
      "http://cronwatch:8000/ping/project-ping-key/notifications-maintenance-notifications-discover-work",
      "http://cronwatch:8000/ping/project-ping-key/notifications-maintenance-notifications-discover-work/fail",
    ]);
    expect(delegate.started).toHaveBeenCalledOnce();
    expect(delegate.completed).toHaveBeenCalledOnce();
    expect(delegate.failed).toHaveBeenCalledOnce();
  });
});
