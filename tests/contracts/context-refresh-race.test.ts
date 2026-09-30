import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { createAuthHandlers, type AuthProvider, type TokenResult } from "../../packages/platform/iam/auth-bff/src/index";
import { createRedisClient, createRedisSessionStore, hashOpaqueSessionId, type StoredSession } from "../../packages/platform/iam/session-store/src/index";

const redisUrl = process.env.AUTH_CONTEXT_TEST_REDIS_URL;
for (const plane of ["neon", "mesh", "studio"] as const) {
  it(`${plane}: context rotation preserves refreshed tokens, including after lease expiry`, { skip: !redisUrl }, async () => {
    const redis = createRedisClient(redisUrl!);
    await redis.connect();
    const namespace = `context-refresh-test:${randomUUID()}`;
    const binding = { plane, realmKey: "athyper" };
    const store = createRedisSessionStore({ redis, namespace });
    const now = Date.now();
    const originalTokens: TokenResult = { accessToken: "access-0", refreshToken: "refresh-0", idToken: "id-0", accessTokenExpiresAt: now + 60_000 };
    const original: StoredSession = { schemaVersion: 1, ...binding, tenantId: "tenant-1", availableContexts: [{ tenantId: "tenant-2", tenantCode: "TWO", tenantName: "Two", principalId: "principal-2", authEpoch: 2 }], principalId: "principal-1", providerSessionId: "provider-1", encryptedTokenBundle: JSON.stringify(originalTokens), accessTokenExpiresAt: originalTokens.accessTokenExpiresAt, refreshGeneration: 0, authEpoch: 1, sessionVersion: 1, requiredActions: [], assurance: "baseline", createdAt: now, lastSeenAt: now, idleExpiresAt: now + 60_000, absoluteExpiresAt: now + 120_000, configurationRevision: "1", keyVersion: 1 };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let generation = 0;
    const unused = async (): Promise<never> => { throw new Error("Unexpected provider call"); };
    const provider: AuthProvider = { exchangeCode: unused, verifyIdToken: unused, createEndSessionUrl: unused, verifyBackchannelLogoutToken: unused, refresh: async ({ sealedTokens }) => {
      // Model Keycloak's zero-reuse policy: the next refresh must use the new token.
      assert.equal((JSON.parse(sealedTokens) as TokenResult).refreshToken, `refresh-${generation}`);
      if (generation === 0) { entered(); await gate; }
      generation++;
      return { accessToken: `access-${generation}`, refreshToken: `refresh-${generation}`, idToken: `id-${generation}`, accessTokenExpiresAt: Date.now() + 60_000 };
    } };
    const origin = `https://${plane}.example`;
    const handlers = createAuthHandlers({ ...binding, issuer: "https://iam.example/realms/athyper", clientId: `${plane}-web`, redirectUri: `${origin}/api/auth/callback`, authorizedRole: "AUTHORIZED", configurationRevision: "1", store, provider, sealTokens: async (tokens) => JSON.stringify(tokens), deriveCsrfToken: () => "csrf", production: true });
    const request = (route: string, cookie = "__Host-athyper-session=original") => new Request(`${origin}/api/auth/${route}`, { method: "POST", headers: { cookie, origin, "x-csrf-token": "csrf", "content-type": "application/json" }, ...(route === "session/context" ? { body: JSON.stringify({ tenantId: "tenant-2" }) } : {}) });
    const id = hashOpaqueSessionId("original");
    let refreshing: Promise<Response> | undefined;
    try {
      await store.create(id, original);
      refreshing = handlers.refresh(request("refresh"));
      await started;
      const blocked = await handlers.context(request("session/context"));
      assert.equal(blocked.status, 409);
      assert.equal(blocked.headers.has("set-cookie"), false);
      // Force the coalescing lease to expire while the provider request is still outstanding.
      await redis.pexpire(`${namespace}:v1:${plane}:athyper:refresh:${id}`, -1);
      assert.equal((await handlers.context(request("session/context"))).status, 409);
      release();
      assert.equal((await refreshing).status, 200);
      const switched = await handlers.context(request("session/context"));
      assert.equal(switched.status, 200);
      const cookie = switched.headers.getSetCookie().find((value) => value.startsWith("__Host-athyper-session="))!.split(";")[0]!;
      const successorId = hashOpaqueSessionId(cookie.slice(cookie.indexOf("=") + 1));
      const successor = (await store.read(binding, successorId))!;
      assert.equal(successor.tenantId, "tenant-2");
      assert.equal(successor.principalId, "principal-2");
      assert.equal(successor.refreshGeneration, 1);
      assert.equal(JSON.parse(successor.encryptedTokenBundle!).refreshToken, "refresh-1");
      assert.equal(await store.read(binding, id), undefined);
      assert.equal((await handlers.refresh(request("refresh", cookie))).status, 200);
      assert.equal(generation, 2);

      // Releasing a newer lease must not remove an older outstanding owner's guard.
      await store.create("owners", original);
      assert.equal(await store.acquireRefreshLock(binding, "owners", "slow", 60_000), true);
      await redis.pexpire(`${namespace}:v1:${plane}:athyper:refresh:owners`, -1);
      assert.equal(await store.acquireRefreshLock(binding, "owners", "fast", 60_000), true);
      await store.releaseRefreshLock(binding, "owners", "fast");
      assert.equal(await store.rotate(binding, "owners", "replacement", { ...original, sessionVersion: 2 }, 1), false);
      const pendingTtl = await redis.pttl(`${namespace}:v1:${plane}:athyper:refresh-pending:owners`);
      assert.ok(pendingTtl > 0 && pendingTtl <= 120_000);
      await store.releaseRefreshLock(binding, "owners", "slow");
      assert.equal(await store.rotate(binding, "owners", "replacement", { ...original, sessionVersion: 2 }, 1), true);
      assert.equal(await store.acquireRefreshLock(binding, "owners", "too-late", 60_000), false);
    } finally {
      release();
      await refreshing;
      const keys = await redis.keys(`${namespace}:*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
  });
}
