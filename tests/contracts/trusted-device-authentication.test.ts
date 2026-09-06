import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthHandlers, type AuthProvider } from "@athyper/platform-iam-auth-bff";
import { hashOpaqueSessionId, type SessionStore, type StoredSession } from "@athyper/platform-iam-session-store";

const now = Date.parse("2026-08-15T12:00:00.000Z");
const rawSession = "session-token";
const rawDevice = "remembered-device-token";

for (const plane of ["neon", "studio", "mesh"] as const) {
  for (const device of ["valid", "expired", "revoked", "absent"] as const) {
    test(`${plane}: ${device} device requires issuer MFA and cannot elevate locally`, async () => {
      const { store, current } = memoryStore();
      let deviceChecks = 0;
      const options = config(store, async () => { deviceChecks++; return { active: device !== "revoked", expiresAt: device === "expired" ? now : now + 60_000 }; });
      const handlers = createAuthHandlers({ ...options, plane, clientId: `${plane}-web`, redirectUri: `https://${plane}.example/api/auth/callback` });
      const before = current();
      const headers = { cookie: `athyper-session=${rawSession}${device === "absent" ? "" : `; athyper-trusted-device=${rawDevice}`}`, origin: `https://${plane}.example`, "x-csrf-token": "proof" };
      const response = await handlers.stepUpStart(new Request(`https://${plane}.example/api/auth/step-up/start?returnTo=%2Fsecure`, { method: "POST", headers }));
      assert.equal(response.status, 302);
      const authorization = new URL(response.headers.get("location")!);
      assert.equal(authorization.searchParams.get("prompt"), "login");
      assert.equal(authorization.searchParams.get("max_age"), "0");
      assert.equal(authorization.searchParams.get("acr_values"), "urn:athyper:assurance:elevated");
      assert.equal(authorization.searchParams.get("redirect_uri"), options.redirectUri.replace("neon", plane));
      assert.ok(authorization.searchParams.get("code_challenge"));
      assert.ok(response.headers.getSetCookie().every(value => !value.startsWith("athyper-session=")));
      const denied = await handlers.mfaVerify(new Request(`https://${plane}.example/api/auth/mfa/verify`, { method: "POST", headers, body: JSON.stringify({ code: "123456" }) }));
      assert.equal(denied.status, 403);
      assert.equal((await denied.json() as { code: string }).code, "auth.step_up_required");
      assert.equal(denied.headers.get("set-cookie"), null);
      assert.equal(deviceChecks, 0);
      assert.deepEqual(current(), before, "no rotation, token replacement or local assurance change before issuer callback");
      for (const handler of [handlers.stepUpStart, handlers.mfaVerify]) {
        const rejected = await handler(new Request(`https://${plane}.example/api/auth/step-up/start`, { method: "POST", headers: { ...headers, origin: "https://other.example" } }));
        assert.equal(rejected.status, 403);
        assert.equal((await rejected.json() as { code: string }).code, "auth.csrf_invalid");
      }
    });
  }
}

function config(store: SessionStore, verifyTrustedDevice: NonNullable<Parameters<typeof createAuthHandlers>[0]["verifyTrustedDevice"]>): Parameters<typeof createAuthHandlers>[0] {
  return {
    plane: "neon", realmKey: "athyper", issuer: "https://iam.example/realms/athyper", clientId: "neon-web",
    redirectUri: "https://neon.example/api/auth/callback", authorizedRole: "NEON_USER", configurationRevision: "1",
    store, provider: unavailableProvider(), now: () => now, sealTokens: async () => "sealed", verifyTrustedDevice, deriveCsrfToken: () => "proof",
  };
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
