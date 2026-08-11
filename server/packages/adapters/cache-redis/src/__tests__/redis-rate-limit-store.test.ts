import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { createRedisRateLimitStore } from "../redis-rate-limit-store.js";

describe("Redis rate-limit store", () => {
  it("uses one atomic script and hashes identity material", async () => {
    const evaluate = vi.fn(async () => [2, 4000]);
    const store = createRedisRateLimitStore({ eval: evaluate } as unknown as Redis, "test:limit");
    await expect(store.consume({ key: "tenant:principal:secret-token", windowMs: 5000, now: 1000 })).resolves.toEqual({ count: 2, resetAt: 5000 });
    expect(evaluate).toHaveBeenCalledWith(expect.any(String), 1, expect.stringMatching(/^test:limit:[a-f0-9]{64}$/), "5000");
    expect(JSON.stringify(evaluate.mock.calls)).not.toContain("secret-token");
  });
});
