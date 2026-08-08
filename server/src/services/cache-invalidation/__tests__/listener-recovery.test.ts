import { EventEmitter } from "node:events";
import type pg from "pg";
import { describe, expect, it, vi } from "vitest";

import { createDescriptorCacheListener } from "@athyper/svc-metadata";

class FakePgClient extends EventEmitter {
  readonly query = vi.fn(async () => ({ rows: [] }));
  readonly end = vi.fn(async () => undefined);
}

describe("descriptor invalidation recovery", () => {
  it("reattaches its PostgreSQL subscriber after a connection error", async () => {
    const first = new FakePgClient();
    const second = new FakePgClient();
    const factory = vi.fn()
      .mockResolvedValueOnce(first as unknown as pg.Client)
      .mockResolvedValueOnce(second as unknown as pg.Client);
    const listener = createDescriptorCacheListener({
      redis: redisMock(),
      logDb: { query: vi.fn(async () => ({ rows: [] })) },
      logger: loggerMock(),
      createListenClient: factory,
      sleep: async () => undefined,
      pollIntervalMs: 60_000,
    });
    await listener.start();
    first.emit("error", new Error("connection lost"));
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    expect(listener.stats().reconnects).toBe(1);
    expect(second.query).toHaveBeenCalledWith("LISTEN desc_invalidate");
    await listener.stop();
  });

  it("replays a durable row by incrementing exact generations and marking it processed", async () => {
    const redis = redisMock();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: "row-1", tenant_id: "tenant-a", entity_code: "purchase_order",
        plane_key: null, reason: "entity_publish", triggered_by_table: "entity_version",
        triggered_by_id: "version-1", created_at: new Date(Date.now() - 10_000).toISOString(),
      }] })
      .mockResolvedValueOnce({ rows: [] });
    const listener = createDescriptorCacheListener({
      redis,
      logDb: { query },
      logger: loggerMock(),
      createListenClient: async () => new FakePgClient() as unknown as pg.Client,
      pollIntervalMs: 60_000,
    });

    await listener.recoverNow();

    expect(redis.incr).toHaveBeenCalledWith("execdesc:gen:v1:neon:tenant-a:purchase_order");
    expect(redis.incr).toHaveBeenCalledWith("execdesc:gen:v1:mesh:tenant-a:purchase_order");
    expect(redis.incr).toHaveBeenCalledWith("execdesc:gen:v1:admin:tenant-a:purchase_order");
    expect(redis.incr).toHaveBeenCalledWith("execdesc:gen:v1:__all__:__all__:__all__");
    expect(redis.publish).toHaveBeenCalledWith("execdesc:invalidate:v1", expect.any(String));
    expect(query.mock.calls[1]?.[1]).toEqual([expect.any(String), 0, "row-1"]);
    expect(listener.stats().generationsIncremented).toBe(13);
    expect(listener.stats().invalidationLagSeconds).toBeGreaterThanOrEqual(10);
    expect(listener.stats().invalidationLagSeconds).toBeLessThan(11);
  });
});

function redisMock() {
  let generation = 0;
  return {
    incr: vi.fn(async () => ++generation),
    publish: vi.fn(async () => 1),
  };
}

function loggerMock() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}
