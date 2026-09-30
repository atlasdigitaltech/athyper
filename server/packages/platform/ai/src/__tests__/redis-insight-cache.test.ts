import { expect, it, vi } from "vitest";
import {
  AtlasRedisInsightCache,
  type AtlasInsightRedis,
} from "../redis-insight-cache.js";
import { context } from "./review-fixture.js";

const binding = {
  canonicalScope: "bp:synthetic",
  descriptorVersions: ["descriptor:1"],
  ruleVersions: ["rule:1"],
  dataRevisions: ["bp:1", "address:2"],
  intent: "brief",
  locale: "en",
};
const proof = () => ({ binding, claims: ["identity", "address"] });
const parse = (v: unknown) => {
  if (
    !v ||
    typeof v !== "object" ||
    !("count" in v) ||
    typeof v.count !== "number"
  )
    throw Error("Invalid evidence");
  return { count: v.count };
};
function fixture() {
  const store = new Map<string, string>();
  const redis: AtlasInsightRedis = {
    eval: vi.fn(async (_s, _n, _key, op, key, _epoch, _ttl, value) => {
      if (op === "get") return ["epoch", store.get(String(key)) ?? ""];
      if (op === "put") store.set(String(key), String(value));
      if (op === "invalidate") store.clear();
      return 1;
    }),
  };
  const cache = new AtlasRedisInsightCache({
    redis,
    parse,
    commandTimeoutMs: 20,
  });
  const input = {
    context,
    snapshot: vi.fn(async () => proof()),
    authorize: vi.fn(async () => true),
    load: vi.fn(async () => ({ count: 2 })),
  };
  return { cache, input, redis, store };
}
it("reauthorizes a hit and does not repeat the owner load", async () => {
  const f = fixture();
  expect((await f.cache.read(f.input)).cacheHit).toBe(false);
  expect((await f.cache.read(f.input)).cacheHit).toBe(true);
  expect(f.input.load).toHaveBeenCalledTimes(1);
  expect(f.input.authorize).toHaveBeenCalledTimes(12);
});
it("denies cache reuse after access is revoked", async () => {
  const f = fixture();
  await f.cache.read(f.input);
  f.input.authorize.mockResolvedValue(false);
  await expect(f.cache.read(f.input)).rejects.toThrow("denied");
  expect(f.input.load).toHaveBeenCalledTimes(1);
});
it.each(["dataRevisions", "ruleVersions", "descriptorVersions"] as const)(
  "misses after related %s changes",
  async (key) => {
    const f = fixture();
    await f.cache.read(f.input);
    f.input.snapshot.mockResolvedValue({
      claims: ["identity", "address"],
      binding: { ...binding, [key]: ["changed"] },
    });
    expect((await f.cache.read(f.input)).cacheHit).toBe(false);
    expect(f.input.load).toHaveBeenCalledTimes(2);
  },
);
it("withholds evidence when owner revisions change during a load", async () => {
  const f = fixture();
  f.input.load.mockImplementation(async () => {
    f.input.snapshot.mockResolvedValue({
      claims: ["identity", "address"],
      binding: { ...binding, dataRevisions: ["changed"] },
    });
    return { count: 2 };
  });
  await expect(f.cache.read(f.input)).rejects.toThrow("revisions changed");
  expect(f.store.size).toBe(0);
});
it("withholds evidence revoked during cache storage", async () => {
  const f = fixture();
  const original = f.redis.eval;
  f.redis.eval = async (...args) => {
    const result = await original(...args);
    if (args[3] === "put") f.input.authorize.mockResolvedValue(false);
    return result;
  };
  await expect(f.cache.read(f.input)).rejects.toThrow("denied");
});
it("falls back to the authorized owner on Redis outage with bounded wait", async () => {
  const f = fixture();
  f.redis.eval = () => new Promise(() => {});
  expect(await f.cache.read(f.input)).toEqual({
    value: { count: 2 },
    cacheHit: false,
  });
  expect(f.input.load).toHaveBeenCalledTimes(1);
});
it("does not disclose an owner result after cancellation", async () => {
  const f = fixture(),
    abort = new AbortController();
  f.input.load.mockImplementation(async () => {
    abort.abort();
    return { count: 2 };
  });
  await expect(
    f.cache.read({ ...f.input, signal: abort.signal }),
  ).rejects.toThrow();
  expect(f.store.size).toBe(0);
});
it("partitions evidence by principal and authorization epoch", async () => {
  const f = fixture();
  await f.cache.read(f.input);
  expect(
    (
      await f.cache.read({
        ...f.input,
        context: { ...context, authEpoch: context.authEpoch + 1 },
      })
    ).cacheHit,
  ).toBe(false);
  const other = {
    ...context,
    principalId: "other",
    permissions: { ...context.permissions, principalId: "other" },
  };
  expect((await f.cache.read({ ...f.input, context: other })).cacheHit).toBe(
    false,
  );
});
it("does not cache without an owner dependency snapshot", async () => {
  const f = fixture();
  await f.cache.read({ ...f.input, snapshot: async () => null });
  expect(f.redis.eval).not.toHaveBeenCalled();
  expect(f.input.load).toHaveBeenCalledTimes(1);
});
it("discards a malformed cached projection and reloads from the owner", async () => {
  const f = fixture();
  await f.cache.read(f.input);
  for (const key of f.store.keys()) f.store.set(key, '{"unexpected":"value"}');
  expect(await f.cache.read(f.input)).toEqual({
    value: { count: 2 },
    cacheHit: false,
  });
  expect(f.input.load).toHaveBeenCalledTimes(2);
});
it("withholds a cached value when dependencies change during the Redis read", async () => {
  const f = fixture();
  await f.cache.read(f.input);
  const original = f.redis.eval;
  f.redis.eval = async (...args) => {
    const result = await original(...args);
    if (args[3] === "get")
      f.input.snapshot.mockResolvedValue({
        claims: ["identity", "address"],
        binding: { ...binding, dataRevisions: ["new-child-row"] },
      });
    return result;
  };
  await expect(f.cache.read(f.input)).rejects.toThrow("revisions changed");
  expect(f.input.load).toHaveBeenCalledTimes(1);
});
it("rejects unbounded configuration and incomplete owner versions", async () => {
  const f = fixture();
  expect(
    () =>
      new AtlasRedisInsightCache({ redis: f.redis, parse, ttlMs: Infinity }),
  ).toThrow();
  await expect(
    f.cache.read({
      ...f.input,
      snapshot: async () => ({
        claims: ["read"],
        binding: { ...binding, dataRevisions: [] },
      }),
    }),
  ).rejects.toThrow("version coordinates");
});
