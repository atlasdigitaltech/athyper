import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AuthFlowError, callbackNavigationResponse, createAuthHandlers, logoutCallbackNavigationResponse, logoutNavigationResponse, type AuthContextOption, type AuthProvider, type TokenResult, type VerifiedIdentity } from "../../packages/platform/iam/auth-bff/src/index";
import { KEYCLOAK_SESSION_TTLS_MS } from "../../packages/platform/iam/auth-bff/src/environment";
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

function setup(overrides: Partial<VerifiedIdentity> = {}, refreshDelayMs = 0, contexts?: readonly AuthContextOption[], planeConfig: { readonly plane: "neon" | "mesh" | "studio"; readonly clientId: string; readonly authorizedRole: string; readonly origin: string } = { plane: "neon", clientId: "neon-web", authorizedRole: "grp:workbench:user", origin: "https://neon.example" }, rejectRefresh = false, registerTrustedDevice?: NonNullable<Parameters<typeof createAuthHandlers>[0]["registerTrustedDevice"]>) {
  const store = new TestStore(); let refreshCount = 0;
  const tokens: TokenResult = { accessToken: "access-secret", refreshToken: "refresh-secret", idToken: "id-token", accessTokenExpiresAt: Date.now() + 60_000 };
  const identity = (): VerifiedIdentity => { const transaction = JSON.parse(store.lastState!) as { nonce: string }; return { issuer: "https://iam.example/realms/athyper", audience: planeConfig.clientId, subject: "principal-1", nonce: transaction.nonce, issuedAt: Date.now() - 100, expiresAt: Date.now() + 60_000, plane: planeConfig.plane, realmKey: "athyper", tenantId: "tenant-1", providerSessionId: "provider-1", roles: [planeConfig.authorizedRole], ...overrides }; };
  const provider: AuthProvider = {
    exchangeCode: async () => tokens, verifyIdToken: async () => identity(),
    refresh: async () => { refreshCount++; if (refreshDelayMs) await new Promise((resolve) => setTimeout(resolve, refreshDelayMs)); if (rejectRefresh) throw new AuthFlowError("auth.refresh_rejected", 401, "rejected"); return { ...tokens, accessToken: `new-access-${refreshCount}` }; },
    createEndSessionUrl: async ({ postLogoutRedirectUri, state }) => `https://iam.example/realms/athyper/protocol/openid-connect/logout?id_token_hint=id-token&post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}&state=${encodeURIComponent(state)}`,
    verifyBackchannelLogoutToken: async (token) => ({ issuer: "https://iam.example/realms/athyper", audience: planeConfig.clientId, providerSessionId: "provider-1", issuedAt: token === "stale" ? Date.now() - 10 * 60_000 : Date.now(), expiresAt: token === "expired" ? Date.now() - 1 : Date.now() + 60_000, tokenId: `logout-token-${planeConfig.plane}-${token}`, ...(token === "nonce" ? { nonce: "not-allowed" } : {}), events: { "http://schemas.openid.net/event/backchannel-logout": {} } }),
  };
  const handlers = createAuthHandlers({ plane: planeConfig.plane, realmKey: "athyper", issuer: "https://iam.example/realms/athyper", clientId: planeConfig.clientId, redirectUri: `${planeConfig.origin}/api/auth/callback`, postLogoutRedirectUri: `${planeConfig.origin}/api/auth/logout/callback`, authorizedRole: planeConfig.authorizedRole, configurationRevision: "test-1", store, provider, resolveContexts: contexts ? async () => contexts : undefined, sealTokens: async () => "encrypted-server-only", deriveCsrfToken: () => "csrf-safe", deriveAcceptedCsrfTokens: () => ["csrf-safe", "csrf-previous"], production: true, ...(registerTrustedDevice ? { registerTrustedDevice } : {}) });
  return { handlers, store, origin: planeConfig.origin, getRefreshCount: () => refreshCount };
}

async function authenticate(setupValue = setup(), returnTo = "/records?view=open") {
  const login = await setupValue.handlers.login(new Request(`${setupValue.origin}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`));
  assert.equal(login.status, 302); const authorization = new URL(login.headers.get("location")!); const state = authorization.searchParams.get("state")!;
  const callback = await setupValue.handlers.callback(callbackRequest(setupValue.origin, `code=code-1&state=${state}`, login));
  return { ...setupValue, callback, cookie: callback.headers.get("set-cookie")!.split(";")[0]! };
}

function oauthCookie(response: Response): string {
  const value = response.headers.getSetCookie().find((cookie) => cookie.startsWith("__Host-athyper-oauth="));
  assert.ok(value, "login must bind the OAuth transaction to a browser cookie");
  return value.split(";")[0]!;
}

function callbackRequest(origin: string, query: string, login: Response, headers: HeadersInit = {}): Request {
  return new Request(`${origin}/api/auth/callback?${query}`, { headers: { ...Object.fromEntries(new Headers(headers)), cookie: oauthCookie(login) } });
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
    const first = await value.handlers.callback(callbackRequest(value.origin, `code=x&state=${state}`, login)); assert.equal(first.headers.get("location"), "/");
    const replay = await value.handlers.callback(callbackRequest(value.origin, `code=x&state=${state}`, login)); assert.equal(replay.status, 400); assert.match(await replay.text(), /invalid_state/);
  });

  it("rejects an OAuth callback that arrives in a different browser context", async () => {
    const value = setup(); const login = await value.handlers.login(new Request("https://neon.example/api/auth/login")); const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    const response = await value.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=x&state=${state}`)); assert.equal(response.status, 400); assert.match(await response.text(), /auth.invalid_state/);
    const legitimate = await value.handlers.callback(callbackRequest(value.origin, `code=x&state=${state}`, login)); assert.equal(legitimate.status, 303);
  });

  it("fails wrong-plane, wrong-nonce, and unavailable Redis requests closed", async () => {
    for (const overrides of [{ plane: "mesh" }, { nonce: "wrong" }, { expiresAt: Date.now() - 1 }]) { const value = setup(overrides); const login = await value.handlers.login(new Request("https://neon.example/api/auth/login")); const state = new URL(login.headers.get("location")!).searchParams.get("state")!; const response = await value.handlers.callback(callbackRequest(value.origin, `code=x&state=${state}`, login)); assert.equal(response.status, 401); }
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

  it("classifies Keycloak authentication expiry as a recoverable timeout and consumes its state", async () => {
    const value = setup();
    const login = await value.handlers.login(new Request("https://neon.example/api/auth/login?returnTo=%2Frecords%3Fview%3Dopen"));
    const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    const request = callbackRequest(value.origin, `error=temporarily_unavailable&error_description=authentication_expired&state=${state}&iss=${encodeURIComponent("https://iam.example/realms/athyper")}`, login, { accept: "text/html", "sec-fetch-dest": "document" });
    const response = await callbackNavigationResponse(request, value.handlers.callback, "https://neon.example");
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://neon.example/sign-in?reason=expired&returnTo=%2Frecords%3Fview%3Dopen");
    const replay = await value.handlers.callback(request);
    assert.equal(replay.status, 400);
    assert.match(await replay.text(), /auth.invalid_state/);
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

  it("accepts the previous CSRF key during a rolling key rotation", async () => {
    const authenticated = await authenticate();
    const headers = { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-previous" };
    assert.equal((await authenticated.handlers.touch(new Request("https://neon.example/api/auth/touch", { method: "POST", headers }))).status, 200);
    assert.equal((await authenticated.handlers.refresh(new Request("https://neon.example/api/auth/refresh", { method: "POST", headers }))).status, 200);
    assert.equal((await authenticated.handlers.stepUpStart(new Request("https://neon.example/api/auth/step-up/start", { method: "POST", headers }))).status, 302);
    const logout = await authenticated.handlers.logout(new Request("https://neon.example/api/auth/logout", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ scope: "application", _csrf: "csrf-previous" }) })); assert.equal(logout.status, 204);
  });

  it("preserves pending required actions and marks next actions explicitly", async () => {
    const { handlers, cookie } = await authenticate(setup({ requiredActions: ["UPDATE_PASSWORD"] })); const response = await handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie } })); const body = await response.json() as Record<string, unknown>; assert.equal(body.state, "required_action"); assert.deepEqual(body.requiredActions, ["UPDATE_PASSWORD"]); assert.deepEqual(body.allowedNextActions, ["complete_required_action", "logout"]);
  });

  it("touches, rotates on context change, revokes on logout and provider logout", async () => {
    const authenticated = await authenticate(); const rejectedTouch = await authenticated.handlers.touch(new Request("https://neon.example/api/auth/touch", { method: "POST", headers: { cookie: authenticated.cookie } })); assert.equal(rejectedTouch.status, 403); const touch = await authenticated.handlers.touch(new Request("https://neon.example/api/auth/touch", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe" } })); assert.equal(touch.status, 200);
    const context = await authenticated.handlers.context(new Request("https://neon.example/api/auth/session/context", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe", "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant-2" }) })); const rotated = context.headers.get("set-cookie")!.split(";")[0]!; assert.notEqual(rotated, authenticated.cookie);
    const backchannel = await authenticated.handlers.backchannelLogout(new Request("https://neon.example/api/auth/backchannel-logout", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "logout_token=valid" })); assert.equal(backchannel.status, 204); const after = await authenticated.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: rotated } })); assert.match(await after.text(), /"state":"anonymous"/);
    const logout = await authenticated.handlers.logout(new Request("https://neon.example/api/auth/logout", { method: "POST", headers: { cookie: `${rotated}; __Host-athyper-csrf=csrf-safe`, origin: "https://neon.example", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body: "scope=application&_csrf=csrf-safe" })); assert.equal(logout.status, 204); assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
  });

  it("keeps application TTL policy aligned with the effective Keycloak realm and client settings", () => {
    const realm = JSON.parse(readFileSync(new URL("../../deploy/config/iam/realm-athyper.json", import.meta.url), "utf8")) as { ssoSessionIdleTimeout: number; ssoSessionMaxLifespan: number; clients: Array<{ clientId: string; attributes?: Record<string, string> }> };
    assert.deepEqual(KEYCLOAK_SESSION_TTLS_MS.neon, { idleTtlMs: realm.ssoSessionIdleTimeout * 1_000, absoluteTtlMs: realm.ssoSessionMaxLifespan * 1_000 });
    assert.deepEqual(KEYCLOAK_SESSION_TTLS_MS.mesh, KEYCLOAK_SESSION_TTLS_MS.neon);
    const studio = realm.clients.find((client) => client.clientId === "studio-web"); assert.ok(studio);
    assert.deepEqual(KEYCLOAK_SESSION_TTLS_MS.studio, { idleTtlMs: Number(studio.attributes?.["client.session.idle.timeout"]) * 1_000, absoluteTtlMs: Number(studio.attributes?.["client.session.max.lifespan"]) * 1_000 });
    const runtimeSource = readFileSync(new URL("../../packages/platform/iam/auth-bff/src/environment.ts", import.meta.url), "utf8"); assert.match(runtimeSource, /idleTtlMs: options\.idleTtlMs/); assert.match(runtimeSource, /absoluteTtlMs: options\.absoluteTtlMs/); assert.match(runtimeSource, /shouldTouchSession/); assert.match(runtimeSource, /store\.touch\(input\.binding, id, input\.idleTtlMs\)/);
  });

  it("fails closed without memberships, auto-selects one, and validates multiple context choices", async () => {
    const none = setup({}, 0, []); const noneLogin = await none.handlers.login(new Request("https://neon.example/api/auth/login")); const noneState = new URL(noneLogin.headers.get("location")!).searchParams.get("state")!; const denied = await none.handlers.callback(callbackRequest(none.origin, `code=x&state=${noneState}`, noneLogin)); assert.equal(denied.status, 403);
    const first = { tenantId: "tenant-1", tenantCode: "ATH", tenantName: "Athyper", principalId: "principal-1", authEpoch: 7, badges: ["2 legal entities"] } satisfies AuthContextOption;
    const only = await authenticate(setup({}, 0, [first])); const onlySession = await only.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: only.cookie } })); assert.equal((await onlySession.json() as { tenantId?: string }).tenantId, "tenant-1");
    const second = { tenantId: "tenant-2", tenantCode: "LAB", tenantName: "Athyper Labs", principalId: "principal-2", authEpoch: 9, badges: ["1 operating organization"] } satisfies AuthContextOption;
    const multiple = await authenticate(setup({}, 0, [first, second])); const before = await multiple.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: multiple.cookie } })); const beforeContext = await before.json() as { state: string; tenantId?: string; principalId?: string; authEpoch?: number }; assert.equal(beforeContext.state, "context_required"); assert.equal(beforeContext.tenantId, undefined); assert.equal(beforeContext.principalId, undefined); assert.equal(beforeContext.authEpoch, undefined);
    const listed = await multiple.handlers.contexts(new Request("https://neon.example/api/auth/contexts", { headers: { cookie: multiple.cookie } })); assert.deepEqual((await listed.json() as { contexts: AuthContextOption[] }).contexts, [first, second]);
    const rejected = await multiple.handlers.context(new Request("https://neon.example/api/auth/session/context", { method: "POST", headers: { cookie: multiple.cookie, origin: "https://neon.example", "x-csrf-token": "csrf-safe", "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant-attacker" }) })); assert.equal(rejected.status, 403);
    const csrfRejected = await multiple.handlers.context(new Request("https://neon.example/api/auth/session/context", { method: "POST", headers: { cookie: multiple.cookie, origin: "https://evil.example", "x-csrf-token": "csrf-safe", "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant-2" }) })); assert.equal(csrfRejected.status, 403);
    const accepted = await multiple.handlers.context(new Request("https://neon.example/api/auth/session/context", { method: "POST", headers: { cookie: multiple.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe", "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant-2" }) })); assert.equal(accepted.status, 200); const selected = await accepted.json() as { tenantId?: string; principalId?: string; authEpoch?: number }; assert.equal(selected.tenantId, "tenant-2"); assert.equal(selected.principalId, "principal-2"); assert.equal(selected.authEpoch, 9);
  });

  it("coalesces concurrent refresh and protects elevation routes with authentication", async () => {
    const authenticated = await authenticate(setup({}, 75)); const request = () => new Request("https://neon.example/api/auth/refresh", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe" } }); const [first, second] = await Promise.all([authenticated.handlers.refresh(request()), authenticated.handlers.refresh(request())]); assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(authenticated.getRefreshCount(), 1);
    assert.equal((await authenticated.handlers.stepUpStart(new Request("https://neon.example/api/auth/step-up/start", { method: "POST" }))).status, 401); assert.equal((await authenticated.handlers.mfaVerify(new Request("https://neon.example/api/auth/mfa/verify", { method: "POST" }))).status, 401);
  });

  it("binds interactive Keycloak MFA step-up to the existing browser session", async () => {
    const authenticated = await authenticate(setup({ assurance: "elevated", authenticationMethods: ["pwd", "otp"] }));
    const started = await authenticated.handlers.stepUpStart(new Request("https://neon.example/api/auth/step-up/start?returnTo=%2Fsecure", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe" } }));
    assert.equal(started.status, 302);
    const authorization = new URL(started.headers.get("location")!);
    assert.equal(authorization.searchParams.get("max_age"), "0");
    assert.equal(authorization.searchParams.get("prompt"), "login");
    const state = authorization.searchParams.get("state")!;
    const completed = await authenticated.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=step-up&state=${state}`, { headers: { cookie: `${oauthCookie(started)}; ${authenticated.cookie}` } }));
    assert.equal(completed.status, 303, await completed.clone().text());
    assert.equal(completed.headers.get("location"), "/secure");
    const elevatedCookie = completed.headers.getSetCookie().find((value) => value.startsWith("__Host-athyper-session="))?.split(";")[0]; assert.ok(elevatedCookie); assert.notEqual(elevatedCookie, authenticated.cookie);
    const superseded = await authenticated.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: authenticated.cookie } })); assert.match(await superseded.text(), /"state":"anonymous"/);
    const session = await authenticated.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: elevatedCookie } }));
    assert.match(await session.text(), /"assurance":"elevated"/);
  });

  it("rejects password-only step-up tokens without elevating the existing session", async () => {
    const authenticated = await authenticate(setup({ assurance: "baseline", authenticationMethods: ["pwd"] }));
    const started = await authenticated.handlers.stepUpStart(new Request("https://neon.example/api/auth/step-up/start", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe" } }));
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const completed = await authenticated.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=password-only&state=${state}`, { headers: { cookie: `${oauthCookie(started)}; ${authenticated.cookie}` } }));
    assert.equal(completed.status, 403); assert.match(await completed.text(), /auth.step_up_assurance_missing/);
    const session = await authenticated.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: authenticated.cookie } })); assert.match(await session.text(), /"assurance":"baseline"/);
  });

  it("enrolls an explicitly remembered browser only after verified MFA", async () => {
    let registration: Parameters<NonNullable<Parameters<typeof createAuthHandlers>[0]["registerTrustedDevice"]>>[0] | undefined;
    const authenticated = await authenticate(setup({ assurance: "elevated", authenticationMethods: ["pwd", "webauthn"] }, 0, undefined, undefined, false, async (input) => { registration = input; return { expiresAt: Date.now() + 30 * 24 * 60 * 60_000 }; }));
    const started = await authenticated.handlers.stepUpStart(new Request("https://neon.example/api/auth/step-up/start?rememberDevice=true", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe" } }));
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const completed = await authenticated.handlers.callback(new Request(`https://neon.example/api/auth/callback?code=remember&state=${state}`, { headers: { cookie: `${oauthCookie(started)}; ${authenticated.cookie}`, "user-agent": "Contract Browser" } }));
    assert.equal(completed.status, 303, await completed.clone().text()); assert.ok(registration); assert.equal(registration.userAgent, "Contract Browser"); assert.equal(registration.authEpoch, 1); assert.match(registration.deviceTokenHash, /^[0-9a-f]{64}$/);
    const trustedCookie = completed.headers.getSetCookie().find((value) => value.startsWith("__Host-athyper-trusted-device=")); assert.ok(trustedCookie); assert.match(trustedCookie, /HttpOnly; SameSite=Strict; Max-Age=/); assert.doesNotMatch(trustedCookie, new RegExp(registration.deviceTokenHash));
  });

  it("revokes the server session when the provider rejects its refresh grant", async () => {
    const authenticated = await authenticate(setup({}, 0, undefined, undefined, true));
    const response = await authenticated.handlers.refresh(new Request("https://neon.example/api/auth/refresh", { method: "POST", headers: { cookie: authenticated.cookie, origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-safe" } }));
    assert.equal(response.status, 401); assert.match(await response.text(), /auth.unauthenticated/);
    const session = await authenticated.handlers.session(new Request("https://neon.example/api/auth/session", { headers: { cookie: authenticated.cookie } })); assert.match(await session.text(), /"state":"anonymous"/);
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

it("restores the exact deep link from server-side OAuth state in all three planes", async () => {
  const destination = "/mdg/business-partner/f7688c3d-8c92-5651-a469-da3f4f786375/supplier?view=open&filter=a%20b";
  for (const plane of ["neon", "mesh", "studio"] as const) {
    const value = setup({}, 0, undefined, { plane, clientId: `${plane}-web`, authorizedRole: "grp:workbench:user", origin: `https://${plane}.example` });
    const { callback } = await authenticate(value, destination);
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), destination);
    assert.equal(value.store.states.size, 0, "OAuth state is consumed once");
  }
});
