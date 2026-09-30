import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { createAuthHandlers, type AuthProvider } from "../../packages/platform/iam/auth-bff/src/index";
import { createRedisClient, createRedisSessionStore, hashOpaqueSessionId, type StoredSession } from "../../packages/platform/iam/session-store/src/index";

const redisUrl = process.env.AUTH_TOUCH_TEST_REDIS_URL;
for (const plane of ["neon", "mesh", "studio"] as const) {
  it(`${plane}: refresh preserves concurrent activity and reports the committed expiry`, { skip: !redisUrl }, async () => {
    const redis = createRedisClient(redisUrl!);
    await redis.connect();
    const namespace = `refresh-touch-test:${randomUUID()}`;
    const binding = { plane, realmKey: "athyper" };
    const store = createRedisSessionStore({ redis, namespace });
    const now = Date.now();
    const original: StoredSession = { schemaVersion: 1, ...binding, tenantId: "tenant-1", principalId: "principal-1", providerSessionId: "provider-1", encryptedTokenBundle: "old-token", availableContexts: [], accessTokenExpiresAt: now + 30_000, refreshGeneration: 0, authEpoch: 1, sessionVersion: 1, requiredActions: [], assurance: "baseline", createdAt: now - 120_000, lastSeenAt: now - 120_000, idleExpiresAt: now + 60_000, absoluteExpiresAt: now + 150_000, configurationRevision: "1", keyVersion: 1 };
    const refreshed = { ...original, encryptedTokenBundle: "new-token", accessTokenExpiresAt: now + 90_000, refreshGeneration: 1, sessionVersion: 2, lastRefreshAt: now };
    const sessionKey = (id: string) => `${namespace}:v1:${plane}:athyper:session:${id}`;
    const check = async (id: string, touched: StoredSession) => {
      const current = (await store.read(binding, id))!;
      assert.equal(current.lastSeenAt, touched.lastSeenAt);
      assert.equal(current.idleExpiresAt, touched.idleExpiresAt);
      assert.equal(current.absoluteExpiresAt, original.absoluteExpiresAt);
      assert.equal(current.encryptedTokenBundle, "new-token");
      assert.equal(current.refreshGeneration, 1);
      assert.equal(current.sessionVersion, 2);
      assert.equal(Number(await redis.pexpiretime(sessionKey(id))), touched.idleExpiresAt);
      const raw = JSON.parse((await redis.get(sessionKey(id)))!);
      assert.deepEqual(raw.requiredActions, []);
      assert.deepEqual(raw.availableContexts, []);
    };
    try {
      await store.create("touch-first", original);
      const touched = (await store.touch(binding, "touch-first", 120_000))!;
      assert.ok(touched.idleExpiresAt > original.idleExpiresAt);
      assert.equal(await store.replaceAfterRefresh(binding, "touch-first", 0, refreshed), true);
      await check("touch-first", touched);

      await store.create("refresh-first", original);
      assert.equal(await store.replaceAfterRefresh(binding, "refresh-first", 0, refreshed), true);
      await check("refresh-first", (await store.touch(binding, "refresh-first", 120_000))!);

      // Force a touch between refresh's merge read and its atomic commit.
      await store.create("commit-race", original);
      let raced = false;
      let raceTouch: StoredSession | undefined;
      const racingRedis = new Proxy(redis, { get(target, property) {
        if (property === "eval") return async (...args: Parameters<typeof redis.eval>) => {
          if (!raced) { raced = true; raceTouch = await store.touch(binding, "commit-race", 300_000); }
          return redis.eval(...args);
        };
        const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
      } });
      assert.equal(await createRedisSessionStore({ redis: racingRedis, namespace }).replaceAfterRefresh(binding, "commit-race", 0, refreshed), true);
      assert.equal(raceTouch!.idleExpiresAt, original.absoluteExpiresAt, "touch remains capped by absolute expiry");
      await check("commit-race", raceTouch!);
      assert.equal(await store.replaceAfterRefresh(binding, "commit-race", 0, { ...refreshed, encryptedTokenBundle: "losing-token" }), false);
      await check("commit-race", raceTouch!);
      await store.revoke(binding, "commit-race");
      assert.equal(await store.replaceAfterRefresh(binding, "commit-race", 1, refreshed), false);
      assert.equal(await store.read(binding, "commit-race"), undefined);

      const id = hashOpaqueSessionId("browser");
      await store.create(id, original);
      const unused = async (): Promise<never> => { throw new Error("Unexpected provider call"); };
      let browserTouch: StoredSession | undefined;
      const provider: AuthProvider = { exchangeCode: unused, verifyIdToken: unused, createEndSessionUrl: unused, verifyBackchannelLogoutToken: unused, refresh: async () => {
        browserTouch = await store.touch(binding, id, 120_000);
        return { accessToken: "new-access", refreshToken: "new-token", idToken: "id", accessTokenExpiresAt: now + 90_000 };
      } };
      const origin = `https://${plane}.example`;
      const handlers = createAuthHandlers({ ...binding, issuer: "https://iam.example/realms/athyper", clientId: `${plane}-web`, redirectUri: `${origin}/api/auth/callback`, authorizedRole: "AUTHORIZED", configurationRevision: "1", store, provider, sealTokens: async () => "new-token", deriveCsrfToken: () => "csrf", production: true });
      const response = await handlers.refresh(new Request(`${origin}/api/auth/refresh`, { method: "POST", headers: { cookie: "__Host-athyper-session=browser", origin, "x-csrf-token": "csrf" } }));
      assert.equal(response.status, 200);
      const body = await response.json() as { idleExpiresAt: string; expiresAt: string };
      assert.equal(body.idleExpiresAt, new Date(browserTouch!.idleExpiresAt).toISOString());
      assert.equal(body.expiresAt, body.idleExpiresAt);
      await check(id, browserTouch!);
    } finally {
      const keys = await redis.keys(`${namespace}:*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
  });
}
