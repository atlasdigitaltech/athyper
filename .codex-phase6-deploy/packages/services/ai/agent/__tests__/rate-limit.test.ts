import { describe, expect, it, vi } from "vitest";
import {
  FixedWindowAgentRateLimiter,
  MemoryAgentCounterStore,
  RedisAgentCounterStore,
} from "../rate-limit.js";

describe("FixedWindowAgentRateLimiter", () => {
  it("enforces the user and tenant budgets independently", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T00:00:10.000Z"));
    const limiter = new FixedWindowAgentRateLimiter(
      new MemoryAgentCounterStore(),
      { userRunsPerMinute: 1, tenantRunsPerMinute: 2 },
    );

    await expect(limiter.check({ tenantId: "tenant-1", principalId: "user-1" }))
      .resolves.toMatchObject({ allowed: true });
    await expect(limiter.check({ tenantId: "tenant-1", principalId: "user-1" }))
      .resolves.toMatchObject({ allowed: false, scope: "user" });
    await expect(limiter.check({ tenantId: "tenant-1", principalId: "user-2" }))
      .resolves.toMatchObject({ allowed: false, scope: "tenant" });

    vi.useRealTimers();
  });

  it("uses one Redis script for atomic INCR plus first-write expiry", async () => {
    const evalCommand = vi.fn(async () => 1);
    const store = new RedisAgentCounterStore({ eval: evalCommand });

    await expect(store.increment("rate-key", 61)).resolves.toBe(1);
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining("EXPIRE"),
      1,
      "rate-key",
      61,
    );
  });
});
