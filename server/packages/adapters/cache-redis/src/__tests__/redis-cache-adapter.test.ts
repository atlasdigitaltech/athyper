import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";

import {
  createRedisCacheAdapter,
  createRedisCacheRuntime,
} from "../redis-cache-adapter.js";
import { REDIS_RETRY_POLICY, isTransientRedisError } from "../retry.js";

describe("Redis cache adapter", () => {
  it("constructs a lazy client with safe defaults", () => {
    const adapter = createRedisCacheAdapter({ url: "redis://localhost:6379/0" });

    expect(adapter.client.options).toMatchObject({
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 10_000,
      maxRetriesPerRequest: 2,
    });
    adapter.client.disconnect(false);
  });

  it("rejects invalid URLs and numeric configuration", () => {
    expect(() => createRedisCacheAdapter({ url: "http://localhost" })).toThrow(
      "redis://",
    );
    expect(() =>
      createRedisCacheAdapter({
        url: "redis://localhost",
        connectTimeoutMs: 0,
      }),
    ).toThrow("connect timeout");
    expect(() =>
      createRedisCacheAdapter({
        url: "redis://localhost",
        maxRetriesPerRequest: -1,
      }),
    ).toThrow("max retries");
  });

  it("connects only a lazy waiting client", async () => {
    const client = fakeClient({ status: "wait" });
    const adapter = createRedisCacheRuntime(client.redis);

    await adapter.connect();

    expect(client.connect).toHaveBeenCalledOnce();
  });

  it("supports string get, delete, TTL, and NX writes", async () => {
    const client = fakeClient();
    const adapter = createRedisCacheRuntime(client.redis);

    await expect(adapter.get(" session:user-1 ")).resolves.toBe("cached");
    await expect(adapter.delete("session:user-1")).resolves.toBe(1);
    await expect(
      adapter.set("session:user-1", "value", {
        ttlSeconds: 60,
        onlyIfAbsent: true,
      }),
    ).resolves.toBe(true);

    expect(client.get).toHaveBeenCalledWith("session:user-1");
    expect(client.del).toHaveBeenCalledWith("session:user-1");
    expect(client.set).toHaveBeenCalledWith(
      "session:user-1",
      "value",
      "EX",
      60,
      "NX",
    );
  });

  it("reports a failed NX write and validates cache inputs", async () => {
    const client = fakeClient();
    client.set.mockResolvedValueOnce(null);
    const adapter = createRedisCacheRuntime(client.redis);

    await expect(
      adapter.set("key", "value", { onlyIfAbsent: true }),
    ).resolves.toBe(false);
    await expect(adapter.set("key", "value", { ttlSeconds: 0 })).rejects.toThrow(
      "TTL",
    );
    await expect(adapter.get(" ")).rejects.toThrow("key");
  });

  it("characterizes healthy and unhealthy PING behavior", async () => {
    const healthy = fakeClient();
    const unhealthy = fakeClient();
    unhealthy.ping.mockRejectedValueOnce(new Error("connection refused"));

    await expect(createRedisCacheRuntime(healthy.redis).health()).resolves.toMatchObject({
      healthy: true,
      latencyMs: expect.any(Number),
    });
    await expect(createRedisCacheRuntime(unhealthy.redis).health()).resolves.toEqual({
      healthy: false,
      message: "connection refused",
    });
  });

  it("closes a connected client exactly once", async () => {
    const client = fakeClient({ status: "ready" });
    const adapter = createRedisCacheRuntime(client.redis);

    await Promise.all([adapter.close(), adapter.close()]);

    expect(client.quit).toHaveBeenCalledOnce();
  });

  it("disconnects an unused lazy client without opening a connection", async () => {
    const client = fakeClient({ status: "wait" });

    await createRedisCacheRuntime(client.redis).close();

    expect(client.disconnect).toHaveBeenCalledWith(false);
    expect(client.quit).not.toHaveBeenCalled();
  });

  it("throttles repeated transport errors", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const adapter = createRedisCacheAdapter({
      url: "redis://localhost:6379/0",
      logger,
      errorLogCooldownMs: 10_000,
    });

    adapter.client.emit("error", new Error("socket failed"));
    adapter.client.emit("error", new Error("socket failed again"));

    expect(logger.error).toHaveBeenCalledOnce();
    adapter.client.disconnect(false);
  });
});

describe("Redis retry classification", () => {
  it.each(["READONLY", "LOADING", "TRYAGAIN", "ECONNRESET"])(
    "classifies %s as transient",
    (code) => {
      expect(isTransientRedisError(Object.assign(new Error("failed"), { code }))).toBe(
        true,
      );
    },
  );

  it("does not retry deterministic command errors", () => {
    expect(isTransientRedisError(new Error("WRONGTYPE operation failed"))).toBe(false);
    expect(REDIS_RETRY_POLICY.maxAttempts).toBe(3);
  });
});

function fakeClient(options: { status?: string } = {}) {
  const connect = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue("cached");
  const set = vi.fn().mockResolvedValue("OK");
  const del = vi.fn().mockResolvedValue(1);
  const ping = vi.fn().mockResolvedValue("PONG");
  const quit = vi.fn().mockResolvedValue("OK");
  const disconnect = vi.fn();
  const redis = {
    status: options.status ?? "ready",
    connect,
    get,
    set,
    del,
    ping,
    quit,
    disconnect,
  } as unknown as Redis;

  return { redis, connect, get, set, del, ping, quit, disconnect };
}
