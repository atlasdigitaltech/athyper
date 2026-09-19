import { describe, expect, it, vi } from "vitest";
import { jobRetention } from "../job-retention.js";
import {
  assertDedicatedJobStore,
  maintainQueue,
} from "../queue-maintenance.js";

describe("job history retention", () => {
  it("rejects cleanup on a shared Redis server even with separate logical databases", () => {
    expect(() =>
      assertDedicatedJobStore("redis://cache:6379/1", "redis://cache/0"),
    ).toThrow(/dedicated Redis/);
    expect(() =>
      assertDedicatedJobStore("redis://jobqueue/0", "redis://memorycache/0"),
    ).not.toThrow();
  });
  it("adds age limits to defaults and numeric producer overrides", () => {
    expect(jobRetention()).toEqual({
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
    });
    expect(jobRetention({ removeOnComplete: 500 })).toMatchObject({
      removeOnComplete: { age: 86400, count: 500 },
    });
    expect(() => jobRetention({ removeOnFail: -1 })).toThrow(/retention/);
    expect(jobRetention({ removeOnFail: false })).toEqual(jobRetention());
    expect(() =>
      jobRetention({ removeOnFail: { age: 604801, count: 5000 } }),
    ).toThrow(/operational history/);
  });
  it("cleans only finalized history with bounded batches, including idle queues", async () => {
    const clean = vi.fn(async () => [] as string[]),
      getJobCounts = vi.fn(async () => ({ wait: 2, failed: 4 }));
    expect(await maintainQueue({ clean, getJobCounts })).toEqual({
      wait: 2,
      failed: 4,
    });
    expect(clean.mock.calls).toEqual([
      [86400000, 1000, "completed"],
      [604800000, 1000, "failed"],
    ]);
  });
});
