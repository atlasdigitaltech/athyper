import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { createAuthHandlers, type AuthProvider, type AuthSecurityEvent } from "../../packages/platform/iam/auth-bff/src/index";
import { createRedisClient, createRedisSessionStore, hashOpaqueSessionId, type StoredSession } from "../../packages/platform/iam/session-store/src/index";

// Use a disposable Redis instance; all keys are scoped to a unique test namespace.
const redisUrl = process.env.AUTH_LOGOUT_TEST_REDIS_URL;
for (const plane of ["neon", "mesh", "studio"] as const) {
  it(`${plane}: backchannel retries recover failures and acknowledge only completed revocation`, { skip: !redisUrl }, async () => {
    const redis = createRedisClient(redisUrl!);
    await redis.connect();
    const namespace = `logout-test:${randomUUID()}`;
    const binding = { plane, realmKey: "athyper" };
    const store = createRedisSessionStore({ redis, namespace });
    const now = Date.now();
    const session: StoredSession = { schemaVersion: 1, ...binding, tenantId: "tenant-1", principalId: "principal-1", providerSessionId: "provider-1", encryptedTokenBundle: "sealed", accessTokenExpiresAt: now + 60_000, refreshGeneration: 0, authEpoch: 1, sessionVersion: 1, requiredActions: [], assurance: "baseline", createdAt: now, lastSeenAt: now, idleExpiresAt: now + 60_000, absoluteExpiresAt: now + 120_000, configurationRevision: "1", keyVersion: 1 };
    const issuer = "https://iam.example/realms/athyper";
    const unused = async (): Promise<never> => { throw new Error("Unexpected provider call"); };
    const provider: AuthProvider = {
      exchangeCode: unused, verifyIdToken: unused, refresh: unused, createEndSessionUrl: unused,
      verifyBackchannelLogoutToken: async (token) => ({ issuer, audience: `${plane}-web`, providerSessionId: "provider-1", issuedAt: now, tokenId: token, events: { "http://schemas.openid.net/event/backchannel-logout": {} } }),
    };
    const marker = (token: string) => `${namespace}:v1:${plane}:athyper:logout-token:${hashOpaqueSessionId(token)}`;
    const request = (token: string) => new Request(`https://${plane}.example/api/auth/backchannel-logout`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ logout_token: token }) });
    try {
      for (const failure of ["before", "after", "legacy"] as const) {
        await store.create("first", session);
        await store.create("second", session);
        await store.create("unrelated", { ...session, providerSessionId: "other-provider" });
        let injected = false;
        const faultyRedis = new Proxy(redis, { get(target, property) {
          if (property === "eval") return async (...args: Parameters<typeof redis.eval>) => {
            if (!injected && failure !== "legacy") {
              injected = true;
              if (failure === "after") await redis.eval(...args);
              throw new Error(failure === "before" ? "Connection lost before execution" : "Reply lost after commit");
            }
            return redis.eval(...args);
          };
          const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
        } });
        const events: AuthSecurityEvent[] = [];
        const handlers = createAuthHandlers({ ...binding, issuer, clientId: `${plane}-web`, redirectUri: `https://${plane}.example/api/auth/callback`, authorizedRole: "AUTHORIZED", configurationRevision: "1", store: createRedisSessionStore({ redis: faultyRedis, namespace }), provider, sealTokens: unused, observeSecurityEvent: (event) => events.push(event) });
        if (failure === "legacy") {
          await redis.set(marker(failure), "1", "PX", 60_000);
        } else {
          assert.equal((await handlers.backchannelLogout(request(failure))).status, 503);
          assert.equal(events.length, 0, "failed delivery is never reported as completed");
          assert.equal(await redis.get(marker(failure)), failure === "before" ? null : "completed");
          assert.equal(!!await store.read(binding, "first"), failure === "before");
        }
        assert.equal((await handlers.backchannelLogout(request(failure))).status, 204);
        assert.equal(await store.read(binding, "first"), undefined);
        assert.equal(await store.read(binding, "second"), undefined);
        assert.ok(await store.read(binding, "unrelated"));
        assert.equal(await redis.get(marker(failure)), "completed");
        const ttl = await redis.pttl(marker(failure));
        assert.ok(ttl > 0 && ttl <= 300_000);
        assert.equal(events[0]?.outcome, failure === "after" ? "replay" : "revoked");
        assert.equal(events[0]?.revokedSessions, failure === "after" ? 0 : 2);
        assert.equal((await handlers.backchannelLogout(request(failure))).status, 204);
        assert.equal(events[1]?.outcome, "replay");
        await store.revoke(binding, "unrelated");
      }
      await store.create("concurrent", session);
      const token = hashOpaqueSessionId("concurrent-delivery");
      const results = await Promise.all([store.completeBackchannelLogout(binding, "provider-1", token, 60_000), store.completeBackchannelLogout(binding, "provider-1", token, 60_000)]);
      assert.equal(results.filter((result) => result.replayed).length, 1);
      assert.equal(results.reduce((total, result) => total + result.revokedSessions, 0), 1);
      assert.equal(await store.read(binding, "concurrent"), undefined);
      assert.deepEqual(await store.completeBackchannelLogout(binding, "missing-provider", hashOpaqueSessionId("no-match"), 60_000), { replayed: false, revokedSessions: 0 });
      assert.deepEqual(await store.completeBackchannelLogout(binding, "missing-provider", hashOpaqueSessionId("no-match"), 60_000), { replayed: true, revokedSessions: 0 });
    } finally {
      const keys = await redis.keys(`${namespace}:*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
  });
}
