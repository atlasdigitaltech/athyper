import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callbackNavigationResponse, createAuthHandlers, logoutCallbackNavigationResponse, logoutNavigationResponse, type AuthContextOption, type AuthProvider, type TokenResult, type VerifiedIdentity } from "../../packages/platform/iam/auth-bff/src/index";
import { SessionStoreUnavailableError, type SessionBinding, type SessionStore, type StoredSession } from "../../packages/platform/iam/session-store/src/index";

class TestStore implements SessionStore {
  sessions = new Map<string, StoredSession>(); states = new Map<string, string>(); locks = new Map<string, string>(); unavailable = false; lastState?: string;
  check() { if (this.unavailable) throw new SessionStoreUnavailableError(); }
  async health() { this.check(); }
  async create(id: string, session: StoredSession) { this.check(); this.sessions.set(id, session); }
  async read(_binding: SessionBinding, id: string) { this.check(); return this.sessions.get(id); }
  async rotate(_binding: SessionBinding, oldId: string | undefined, newId: string, session: StoredSession) { this.check(); if (oldId) this.sessions.delete(oldId); this.sessions.set(newId, session); }
  async revoke(_binding: SessionBinding, id: string) { this.check(); return this.sessions.delete(id); }
  async revokePrincipal(_binding: SessionBinding, principalId: string) { this.check(); let count = 0; for (const [key, value] of this.sessions) if (value.principalId === principalId) { this.sessions.delete(key); count++; } return count; }
  async revokeProviderSession(_binding: SessionBinding, providerSessionId: string) { this.check(); let count = 0; for (const [key, value] of this.sessions) if (value.providerSessionId === providerSessionId) { this.sessions.delete(key); count++; } return count; }
  async putOneTimeState(_binding: SessionBinding, key: string, value: string) { this.check(); this.states.set(key, value); this.lastState = value; }
  async consumeOneTimeState(_binding: SessionBinding, key: string) { this.check(); const value = this.states.get(key); this.states.delete(key); return value; }
  async claimLogoutToken(_binding: SessionBinding, key: string) { this.check(); if (this.states.has(`logout:${key}`)) return false; this.states.set(`logout:${key}`, "1"); return true; }
  async touch(_binding: SessionBinding, id: string, idleTtlMs: number) { this.check(); const current = this.sessions.get(id); if (!current) return undefined; const touched = { ...current, lastSeenAt: Date.now(), idleExpiresAt: Math.min(Date.now() + idleTtlMs, current.absoluteExpiresAt) }; this.sessions.set(id, touched); return touched; }
  async acquireRefreshLock(_binding: SessionBinding, id: string, owner: string) { this.check(); if (this.locks.has(id)) return false; this.locks.set(id, owner); return true; }
  async releaseRefreshLock(_binding: SessionBinding, id: string, owner: string) { this.check(); if (this.locks.get(id) === owner) this.locks.delete(id); }
  async replaceAfterRefresh(_binding: SessionBinding, id: string, generation: number, session: StoredSession) { this.check(); if (this.sessions.get(id)?.refreshGeneration !== generation) return false; this.sessions.set(id, session); return true; }
}

function setup(overrides: Partial<VerifiedIdentity> = {}, refreshDelayMs = 0, contexts?: readonly AuthContextOption[], planeConfig: { readonly plane: "neon" | "mesh" | "studio"; readonly clientId: string; readonly authorizedRole: string; readonly origin: string } = { plane: "neon", clientId: "neon-web", authorizedRole: "grp:workbench:user", origin: "https://neon.example" }) {
  const store = new TestStore(); let refreshCount = 0;
  const tokens: TokenResult = { accessToken: "access-secret", refreshToken: "refresh-secret", idToken: "id-token", accessTokenExpiresAt: Date.now() + 60_000 };
  const identity = (): VerifiedIdentity => { const transaction = JSON.parse(store.lastState!) as { nonce: string }; return { issuer: "https://iam.example/realms/athyper", audience: planeConfig.clientId, subject: "principal-1", nonce: transaction.nonce, issuedAt: Date.now() - 100, expiresAt: Date.now() + 60_000, plane: planeConfig.plane, realmKey: "athyper", tenantId: "tenant-1", providerSessionId: "provider-1", roles: [planeConfig.authorizedRole], ...overrides }; };
  const provider: AuthProvider = {
    exchangeCode: async () => tokens, verifyIdToken: async () => identity(),
    refresh: async () => { refreshCount++; if (refreshDelayMs) await new Promise((resolve) => setTimeout(resolve, refreshDelayMs)); return { ...tokens, accessToken: `new-access-${refreshCount}` }; },
    createEndSessionUrl: async ({ postLogoutRedirectUri, state }) => `https://iam.example/realms/athyper/protocol/openid-connect/logout?id_token_hint=id-token&post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}&state=${encodeURIComponent(state)}`,
    verifyBackchannelLogoutToken: async (token) => ({ issuer: "https://iam.example/realms/athyper", audience: planeConfig.clientId, providerSessionId: "provider-1", issuedAt: token === "stale" ? Date.now() - 10 * 60_000 : Date.now(), expiresAt: token === "expired" ? Date.now() - 1 : Date.now() + 60_000, tokenId: `logout-token-${planeConfig.plane}-${token}`, ...(token === "nonce" ? { nonce: "not-allowed" } : {}), events: { "http://schemas.openid.net/event/backchannel-logout": {} } }),
  };
  const handlers = createAuthHandlers({ plane: planeConfig.plane, realmKey: "athyper", issuer: "https://iam.example/realms/athyper", clientId: planeConfig.clientId, redirectUri: `${planeConfig.origin}/api/auth/callback`, postLogoutRedirectUri: `${planeConfig.origin}/api/auth/logout/callback`, authorizedRole: planeConfig.authorizedRole, configurationRevision: "test-1", store, provider, resolveContexts: contexts ? async () => contexts : undefined, sealTokens: async () => "encrypted-server-only", deriveCsrfToken: () => "csrf-safe", production: true });
  return { handlers, store, getRefreshCount: () => refreshCount };
}

async function authenticate(setupValue = setup(), returnTo = "/records?view=open") {
  const login = await setupValue.handlers.login(new Request(`https://neon.example/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`));
  assert.equal(login.status, 302); const authorization = new URL(login.headers.get("location")!); const state = authorization.searchParams.get("state")!;
  const callback = await setupValue.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=code-1&state=${state}`));
  return { ...setupValue, callback, cookie: callback.headers.get("set-cookie")!.split(";")[0]! };
}

describe("Phase 3 authentication foundation", () => {
  it("uses a distinct provider account-selection request only for account switching", async () => {
    const value = setup();
    const retry = await value.handlers.login(new Request("https://neon.example/api/auth/login?mode=retry"));
    const switching = await value.handlers.login(new Request("https://neon.example/api/auth/login?mode=switch"));
    assert.equal(new URL(retry.headers.get("location")!).searchParams.has("prompt"), false);
    assert.equal(new URL(switching.headers.get("location")!).searchParams.get("prompt"), "select_account");
  });

  it("completes PKCE login/callback, rotates a host cookie, and exposes no tokens", async () => {
    const { handlers, callback, cookie } = await authenticate(); assert.equal(callback.status, 303); assert.equal(callback.headers.get("location"), "/records?view=open"); const cookies = callback.headers.getSetCookie(); assert.match(cookies[0]!, /^__Host-athyper-session=.*HttpOnly.*SameSite=Lax.*Secure/); assert.match(cookies[1]!, /^__Host-athyper-csrf=csrf-safe; Path=\/; SameSite=Strict; Secure$/); assert.doesNotMatch(cookies[1]!, /HttpOnly/);
    const response = await handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie } })); const body = await response.text(); assert.equal(response.status, 200); assert.match(body, /"state":"authenticated"/); assert.doesNotMatch(body, /access-secret|refresh-secret|id-token|provider-1|encrypted-server-only/);
  });

  it("sanitizes unsafe returnTo and rejects replayed state", async () => {
    const value = setup(); const login = await value.handlers.login(new Request("https://neon.example/api/auth/login?returnTo=https://evil.example/steal")); const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    const first = await value.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=x&state=${state}`)); assert.equal(first.headers.get("location"), "/");
    const replay = await value.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=x&state=${state}`)); assert.equal(replay.status, 400); assert.match(await replay.text(), /invalid_state/);
  });

  it("fails wrong-plane, wrong-nonce, and unavailable Redis requests closed", async () => {
    for (const overrides of [{ plane: "mesh" }, { nonce: "wrong" }, { expiresAt: Date.now() - 1 }]) { const value = setup(overrides); const login = await value.handlers.login(new Request("https://neon.example/api/auth/login")); const state = new URL(login.headers.get("location")!).searchParams.get("state")!; const response = await value.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=x&state=${state}`)); assert.equal(response.status, 401); }
    const value = setup(); value.store.unavailable = true; const response = await value.handlers.login(new Request("https://neon.example/api/auth/login")); assert.equal(response.status, 503); assert.match(await response.text(), /session_store_unavailable/);
  });

  it("redirects failed browser callbacks to a safe sign-in recovery page while retaining API problems", async () => {
    const browser = await callbackNavigationResponse(new Request("https://neon.example/api/auth/callback", { headers: { accept: "text/html", "sec-fetch-dest": "document" } }), async () => new Response('{"code":"auth.invalid_identity"}', { status: 401, headers: { "content-type": "application/problem+json" } }));
    assert.equal(browser.status, 303); assert.equal(browser.headers.get("location"), "https://neon.example/sign-in?reason=access");
    const api = await callbackNavigationResponse(new Request("https://neon.example/api/auth/callback", { headers: { accept: "application/json" } }), async () => new Response('{"code":"auth.invalid_identity"}', { status: 401, headers: { "content-type": "application/problem+json" } }));
    assert.equal(api.status, 401); assert.match(await api.text(), /auth.invalid_identity/);
    const proxiedBrowser = await callbackNavigationResponse(new Request("https://neon.example/api/auth/callback"), async () => new Response("unavailable", { status: 503, headers: { "content-type": "application/problem+json" } }));
    assert.equal(proxiedBrowser.status, 303); assert.equal(proxiedBrowser.headers.get("location"), "https://neon.example/sign-in?reason=service");
    const forwardedBrowser = await callbackNavigationResponse(new Request("http://localhost:3101/api/auth/callback"), async () => new Response("denied", { status: 401, headers: { "content-type": "application/problem+json" } }), "https://neon.athyper.local");
    assert.equal(forwardedBrowser.headers.get("location"), "https://neon.athyper.local/sign-in?reason=access");
  });

  it("returns browser form logout to sign-in while retaining a 204 API logout", async () => {
    const browser = await logoutNavigationResponse(new Request("http://localhost:3101/api/auth/logout", { method: "POST", headers: { accept: "text/html" } }), async () => new Response(null, { status: 204, headers: { "set-cookie": "athyper-session=; Max-Age=0" } }), "https://neon.athyper.local");
    assert.equal(browser.status, 303); assert.equal(browser.headers.get("location"), "https://neon.athyper.local/sign-in?reason=signed-out"); assert.match(browser.headers.get("set-cookie")!, /Max-Age=0/);
    const api = await logoutNavigationResponse(new Request("https://neon.example/api/auth/logout", { method: "POST", headers: { accept: "application/json" } }), async () => new Response(null, { status: 204 }));
    assert.equal(api.status, 204);
  });

  it("never presents failed Redis revocation as a successful browser logout", async () => {
    const authenticated = await authenticate(); authenticated.store.unavailable = true;
    const request = new Request("https://neon.example/api/auth/logout", { method: "POST", headers: { accept: "text/html", cookie: `${authenticated.cookie}; __Host-athyper-csrf=csrf-safe`, origin: "https://neon.example", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body: "scope=application&_csrf=csrf-safe" });
    const response = await logoutNavigationResponse(request, authenticated.handlers.logout, "https://neon.example");
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "https://neon.example/sign-in?reason=logout-incomplete"); assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
  });

  it("performs RP-initiated global logout with one-time state and a safe callback", async () => {
    const authenticated = await authenticate();
    const request = new Request("https://neon.example/api/auth/logout", { method: "POST", headers: { accept: "text/html", cookie: `${authenticated.cookie}; __Host-athyper-csrf=csrf-safe`, origin: "https://neon.example", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body: "scope=global&_csrf=csrf-safe" });
    const direct = await authenticated.handlers.logout(request); assert.equal(direct.status, 303, await direct.clone().text());
    const response = await logoutNavigationResponse(request, async () => direct, "https://neon.example"); assert.equal(response.status, 303);
    const endpoint = new URL(response.headers.get("location")!); assert.equal(endpoint.origin, "https://iam.example"); assert.equal(endpoint.pathname, "/realms/athyper/protocol/openid-connect/logout"); assert.equal(endpoint.searchParams.get("id_token_hint"), "id-token"); assert.equal(endpoint.searchParams.get("post_logout_redirect_uri"), "https://neon.example/api/auth/logout/callback");
    const state = endpoint.searchParams.get("state")!; const callback = await authenticated.handlers.logoutCallback(new Request(`https://neon.example/api/auth/logout/callback?state=${state}`)); assert.equal(callback.status, 303); assert.equal(callback.headers.get("location"), "https://neon.example/sign-in?reason=signed-out-everywhere");
    const replay = await logoutCallbackNavigationResponse(new Request(`https://neon.example/api/auth/logout/callback?state=${state}`, { headers: { accept: "text/html" } }), authenticated.handlers.logoutCallback, "https://neon.example"); assert.equal(replay.status, 303); assert.equal(replay.headers.get("location"), "https://neon.example/sign-in?reason=logout-incomplete");
  });

  it("rejects logout without same-origin CSRF proof", async () => {
    const authenticated = await authenticate(); const request = new Request("https://neon.example/api/auth/logout", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "scope=application&_csrf=csrf-safe" }); const response = await authenticated.handlers.logout(request); assert.equal(response.status, 403); assert.match(await response.text(), /auth.csrf_invalid/); assert.equal(response.headers.has("set-cookie"), false);
  });

  it("preserves pending required actions and marks next actions explicitly", async () => {
    const { handlers, cookie } = await authenticate(setup({ requiredActions: ["UPDATE_PASSWORD"] })); const response = await handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie } })); const body = await response.json() as Record<string, unknown>; assert.equal(body.state, "required_action"); assert.deepEqual(body.requiredActions, ["UPDATE_PASSWORD"]); assert.deepEqual(body.allowedNextActions, ["complete_required_action", "logout"]);
  });

  it("touches, rotates on context change, revokes on logout and provider logout", async () => {
    const authenticated = await authenticate(); const touch = await authenticated.handlers.touch(new Request("https://neon.example/api/auth/touch", { method: "POST", headers: { cookie: authenticated.cookie } })); assert.equal(touch.status, 200);
    const context = await authenticated.handlers.context(new Request("https://neon.example/api/auth/session/context", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe", "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant-2" }) })); const rotated = context.headers.get("set-cookie")!.split(";")[0]!; assert.notEqual(rotated, authenticated.cookie);
    const backchannel = await authenticated.handlers.backchannelLogout(new Request("https://neon.example/api/auth/backchannel-logout", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "logout_token=valid" })); assert.equal(backchannel.status, 204); const after = await authenticated.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: rotated } })); assert.match(await after.text(), /"state":"anonymous"/);
    const logout = await authenticated.handlers.logout(new Request("https://neon.example/api/auth/logout", { method: "POST", headers: { cookie: `${rotated}; __Host-athyper-csrf=csrf-safe`, origin: "https://neon.example", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body: "scope=application&_csrf=csrf-safe" })); assert.equal(logout.status, 204); assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
  });

  it("fails closed without memberships, auto-selects one, and validates multiple context choices", async () => {
    const none = setup({}, 0, []); const noneLogin = await none.handlers.login(new Request("https://neon.example/api/auth/login")); const noneState = new URL(noneLogin.headers.get("location")!).searchParams.get("state")!; const denied = await none.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=x&state=${noneState}`)); assert.equal(denied.status, 403);
    const first = { tenantId: "tenant-1", tenantCode: "ATH", tenantName: "Athyper", principalId: "principal-1", badges: ["2 legal entities"] } satisfies AuthContextOption;
    const only = await authenticate(setup({}, 0, [first])); const onlySession = await only.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: only.cookie } })); assert.equal((await onlySession.json() as { tenantId?: string }).tenantId, "tenant-1");
    const second = { tenantId: "tenant-2", tenantCode: "LAB", tenantName: "Athyper Labs", principalId: "principal-2", badges: ["1 operating organization"] } satisfies AuthContextOption;
    const multiple = await authenticate(setup({}, 0, [first, second])); const before = await multiple.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: multiple.cookie } })); assert.equal((await before.json() as { state: string }).state, "context_required");
    const listed = await multiple.handlers.contexts(new Request("https://neon.example/api/auth/contexts", { headers: { cookie: multiple.cookie } })); assert.deepEqual((await listed.json() as { contexts: AuthContextOption[] }).contexts, [first, second]);
    const rejected = await multiple.handlers.context(new Request("https://neon.example/api/auth/session/context", { method: "POST", headers: { cookie: multiple.cookie, origin: "https://neon.example", "x-csrf-token": "csrf-safe", "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant-attacker" }) })); assert.equal(rejected.status, 403);
    const csrfRejected = await multiple.handlers.context(new Request("https://neon.example/api/auth/session/context", { method: "POST", headers: { cookie: multiple.cookie, origin: "https://evil.example", "x-csrf-token": "csrf-safe", "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant-2" }) })); assert.equal(csrfRejected.status, 403);
    const accepted = await multiple.handlers.context(new Request("https://neon.example/api/auth/session/context", { method: "POST", headers: { cookie: multiple.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe", "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant-2" }) })); assert.equal(accepted.status, 200); const selected = await accepted.json() as { tenantId?: string; principalId?: string; authEpoch?: number }; assert.equal(selected.tenantId, "tenant-2"); assert.equal(selected.principalId, "principal-2"); assert.equal(selected.authEpoch, 2);
  });

  it("coalesces concurrent refresh and reports unsupported elevation routes", async () => {
    const authenticated = await authenticate(setup({}, 75)); const request = () => new Request("https://neon.example/api/auth/refresh", { method: "POST", headers: { cookie: authenticated.cookie } }); const [first, second] = await Promise.all([authenticated.handlers.refresh(request()), authenticated.handlers.refresh(request())]); assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(authenticated.getRefreshCount(), 1);
    assert.equal((await authenticated.handlers.stepUpStart(new Request("https://neon.example/api/auth/step-up/start", { method: "POST" }))).status, 501); assert.equal((await authenticated.handlers.mfaVerify(new Request("https://neon.example/api/auth/mfa/verify", { method: "POST" }))).status, 501);
  });

  it("preserves a safe returnTo when callback recovery is required", async () => {
    const response = await callbackNavigationResponse(new Request("https://neon.example/api/auth/callback", { headers: { accept: "text/html" } }), async () => new Response("failed", { status: 503, headers: { "content-type": "application/problem+json", "x-athyper-auth-return-to": "/records?view=open" } })); const location = new URL(response.headers.get("location")!); assert.equal(location.searchParams.get("reason"), "service"); assert.equal(location.searchParams.get("returnTo"), "/records?view=open");
  });

  it("revokes Redis sessions through verified backchannel delivery in every active plane", async () => {
    const configurations = [
      { plane: "neon", clientId: "neon-web", authorizedRole: "NEON_USER", origin: "https://neon.example" },
      { plane: "mesh", clientId: "mesh-web", authorizedRole: "MESH_BUYER_USER", origin: "https://mesh.example" },
      { plane: "studio", clientId: "studio-web", authorizedRole: "STUDIO_USER", origin: "https://studio.example" },
    ] as const;
    for (const configuration of configurations) {
      const authenticated = await authenticate(setup({}, 0, undefined, configuration)); const delivered = await authenticated.handlers.backchannelLogout(new Request(`${configuration.origin}/api/auth/backchannel-logout`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "logout_token=valid" })); assert.equal(delivered.status, 204, configuration.plane); const session = await authenticated.handlers.session(new Request(`${configuration.origin}/api/auth/session`, { headers: { cookie: authenticated.cookie } })); assert.equal((await session.json() as { state: string }).state, "anonymous", configuration.plane);
      const replay = await authenticated.handlers.backchannelLogout(new Request(`${configuration.origin}/api/auth/backchannel-logout`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "logout_token=valid" })); assert.equal(replay.status, 204, `${configuration.plane} replay must be idempotent`);
    }
  });

  it("rejects stale, expired, or nonce-bearing backchannel logout tokens", async () => {
    for (const token of ["stale", "expired", "nonce"]) { const value = setup(); const response = await value.handlers.backchannelLogout(new Request("https://neon.example/api/auth/backchannel-logout", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `logout_token=${token}` })); assert.equal(response.status, 401, token); assert.match(await response.text(), /auth.invalid_identity/); }
  });
});
