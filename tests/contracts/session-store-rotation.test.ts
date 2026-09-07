import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { createRedisClient, createRedisSessionStore, type StoredSession } from "../../packages/platform/iam/session-store/src/index";

// Run against a disposable Redis instance with AUTH_ROTATION_TEST_REDIS_URL.
const redisUrl = process.env.AUTH_ROTATION_TEST_REDIS_URL;
for (const plane of ["neon", "mesh", "studio"] as const) {
  it(`${plane}: Redis rotation cannot resurrect or fork a predecessor`, { skip: !redisUrl }, async () => {
    const redis = createRedisClient(redisUrl!);
    await redis.connect();
    const namespace = `rotation-test:${randomUUID()}`;
    const binding = { plane, realmKey: "athyper" };
    const store = createRedisSessionStore({ redis, namespace });
    const now = Date.now();
    const original: StoredSession = { schemaVersion: 1, ...binding, tenantId: "tenant-1", principalId: "principal-1", providerSessionId: "provider-1", encryptedTokenBundle: "sealed", accessTokenExpiresAt: now + 60_000, refreshGeneration: 0, authEpoch: 1, sessionVersion: 1, requiredActions: [], assurance: "baseline", createdAt: now, lastSeenAt: now, idleExpiresAt: now + 60_000, absoluteExpiresAt: now + 120_000, configurationRevision: "1", keyVersion: 1 };
    const replacement = { ...original, sessionVersion: 2, principalId: "principal-2" };
    try {
      // Pause immediately before Lua so revocation happens after rotation's read.
      for (const revoke of [() => store.revoke(binding, "old"), () => store.revokeProviderSession(binding, "provider-1"), () => store.revokePrincipal(binding, "principal-1")]) {
        await store.create("old", original);
        const racingRedis = new Proxy(redis, { get(target, property) {
          if (property === "eval") return async (...args: Parameters<typeof redis.eval>) => { await revoke(); return redis.eval(...args); };
          const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
        } });
        const racingStore = createRedisSessionStore({ redis: racingRedis, namespace });
        assert.equal(await racingStore.rotate(binding, "old", "revived", replacement, 1), false);
        assert.equal(await store.read(binding, "revived"), undefined);
      }
      await store.create("old", original);
      const results = await Promise.all([store.rotate(binding, "old", "first", replacement, 1), store.rotate(binding, "old", "second", replacement, 1)]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(await store.read(binding, "old"), undefined);
      const winner = results[0] ? "first" : "second";
      assert.ok(await store.read(binding, winner));
      assert.equal(await store.revokePrincipal(binding, "principal-1"), 0, "old principal index is cleaned");
      assert.equal(await store.revokeProviderSession(binding, "provider-1"), 1);
      assert.equal(await store.read(binding, winner), undefined);

      await store.create("old", original);
      assert.equal(await store.replaceAfterRefresh(binding, "old", 0, { ...original, sessionVersion: 2, refreshGeneration: 1 }), true);
      assert.equal(await store.rotate(binding, "old", "stale", replacement, 1), false);
      assert.equal(await store.read(binding, "stale"), undefined);
      await store.create("occupied", original);
      assert.equal(await store.rotate(binding, "old", "occupied", { ...replacement, sessionVersion: 3 }, 2), false);
      assert.equal((await store.read(binding, "old"))?.refreshGeneration, 1);
      assert.equal((await store.read(binding, "occupied"))?.sessionVersion, 1);
    } finally {
      const keys = await redis.keys(`${namespace}:*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
  });
}
