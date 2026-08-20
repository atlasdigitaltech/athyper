import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthHandlers, type AuthProvider } from "@athyper/platform-iam-auth-bff";
import { hashOpaqueSessionId, type SessionStore, type StoredSession } from "@athyper/platform-iam-session-store";

const now = Date.parse("2026-08-15T12:00:00.000Z");
const rawSession = "session-token";
const rawDevice = "remembered-device-token";

test("an expired trusted device cannot satisfy remembered-device authentication", async () => {
  const { store, current } = memoryStore();
  const handlers = createAuthHandlers(config(store, async () => ({ active: true, expiresAt: now })));
  const response = await handlers.stepUpStart(request());

  assert.equal(response.status, 403);
  assert.equal((await response.json() as { code: string }).code, "auth.step_up_required");
  assert.match(response.headers.get("set-cookie") ?? "", /athyper-trusted-device=;.*Max-Age=0/);
  assert.equal(current().assurance, "baseline");
});

test("only an unrevoked, unexpired exact-device decision elevates the session", async () => {
  const { store, current } = memoryStore();
  const handlers = createAuthHandlers(config(store, async (input) => {
    assert.equal(input.tenantId, "10000000-0000-4000-8000-000000000001");
    assert.equal(input.principalId, "20000000-0000-4000-8000-000000000001");
    assert.equal(input.authEpoch, 7);
    assert.match(input.deviceTokenHash, /^[0-9a-f]{64}$/);
    return { active: true, expiresAt: now + 60_000 };
  }));
  const response = await handlers.stepUpStart(request());

  assert.equal(response.status, 200, await response.clone().text());
  const rotatedCookie = response.headers.getSetCookie().find((value) => value.startsWith("athyper-session=")); assert.ok(rotatedCookie); assert.doesNotMatch(rotatedCookie, new RegExp(rawSession));
  assert.equal(current().assurance, "elevated");
  assert.equal(current().elevationExpiresAt, now + 60_000);
  assert.equal(current().authEpoch, 7, "session elevation must not invent a database authority epoch");
});

function config(store: SessionStore, verifyTrustedDevice: NonNullable<Parameters<typeof createAuthHandlers>[0]["verifyTrustedDevice"]>): Parameters<typeof createAuthHandlers>[0] {
  return {
    plane: "neon", realmKey: "athyper", issuer: "https://iam.example/realms/athyper", clientId: "neon-web",
    redirectUri: "https://neon.example/api/auth/callback", authorizedRole: "NEON_USER", configurationRevision: "1",
    store, provider: unavailableProvider(), now: () => now, sealTokens: async () => "sealed", verifyTrustedDevice,
  };
}

function request(): Request {
  return new Request("https://neon.example/api/auth/step-up/start", { method: "POST", headers: { cookie: `athyper-session=${rawSession}; athyper-trusted-device=${rawDevice}` } });
}

function memoryStore(): { store: SessionStore; current: () => StoredSession } {
  let session: StoredSession = {
    schemaVersion: 1, plane: "neon", realmKey: "athyper", tenantId: "10000000-0000-4000-8000-000000000001",
    principalId: "20000000-0000-4000-8000-000000000001", providerSessionId: "provider-session", encryptedTokenBundle: "sealed",
    accessTokenExpiresAt: now + 300_000, refreshGeneration: 0, authEpoch: 7, sessionVersion: 3, requiredActions: [], assurance: "baseline",
    createdAt: now - 60_000, lastSeenAt: now - 1_000, idleExpiresAt: now + 300_000, absoluteExpiresAt: now + 600_000,
    configurationRevision: "1", keyVersion: 1,
  };
  let activeId = hashOpaqueSessionId(rawSession);
  const store = {
    async health() {}, async create() {},
    async read(_binding, id) { return id === activeId ? session : undefined; },
    async rotate(_binding, oldId, newId, replacement) { assert.equal(oldId, activeId); assert.notEqual(newId, activeId); activeId = newId; session = replacement; },
    async revoke() { return false; }, async revokePrincipal() { return 0; }, async revokeProviderSession() { return 0; },
    async putOneTimeState() {}, async consumeOneTimeState() { return undefined; }, async claimLogoutToken() { return false; },
    async touch() { return session; }, async acquireRefreshLock() { return false; }, async releaseRefreshLock() {}, async replaceAfterRefresh() { return false; },
  } satisfies SessionStore;
  return { store, current: () => session };
}

function unavailableProvider(): AuthProvider {
  const unavailable = async (): Promise<never> => { throw new Error("provider must not be called by remembered-device authentication"); };
  return { exchangeCode: unavailable, verifyIdToken: unavailable, refresh: unavailable, createEndSessionUrl: unavailable, verifyBackchannelLogoutToken: unavailable };
}
