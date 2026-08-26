import { createHash, randomBytes, randomUUID } from "node:crypto";
import { allowedNextActions, decideSession, sanitizeReturnTo, type SanitizedSession, type SessionPlane } from "@athyper/platform-iam-session";
import { hashOpaqueSessionId, SessionStoreUnavailableError, type SessionBinding, type SessionStore, type StoredSession, type StoredSessionContext } from "@athyper/platform-iam-session-store";

export type AuthContextOption = StoredSessionContext;

export interface PkceTransaction {
  readonly state: string; readonly nonce: string; readonly verifier: string; readonly challenge: string;
  readonly browserBindingHash: string; readonly returnTo: string; readonly createdAt: number;
  readonly purpose?: "login" | "step_up";
  readonly sessionIdHash?: string;
  readonly rememberDevice?: boolean;
}
export interface TokenResult { readonly accessToken: string; readonly refreshToken?: string; readonly idToken: string; readonly accessTokenExpiresAt: number; }
export interface VerifiedIdentity {
  readonly issuer: string; readonly audience: string | readonly string[]; readonly subject: string; readonly nonce?: string;
  readonly issuedAt: number; readonly expiresAt: number; readonly plane: string; readonly realmKey: string;
  readonly tenantId?: string; readonly providerSessionId: string; readonly roles: readonly string[]; readonly requiredActions?: readonly string[];
  /** Issuer-derived authentication evidence. Request parameters never set these values. */
  readonly assurance?: "baseline" | "elevated";
  readonly authenticationMethods?: readonly string[];
}
export interface BackchannelIdentity {
  readonly issuer: string; readonly audience: string | readonly string[]; readonly providerSessionId: string;
  readonly issuedAt: number; readonly expiresAt?: number; readonly tokenId: string; readonly nonce?: string;
  readonly events: Readonly<Record<string, unknown>>;
}
export interface AuthSecurityEvent {
  readonly type: "backchannel_logout"; readonly plane: SessionPlane;
  readonly outcome: "revoked" | "no_match" | "replay"; readonly revokedSessions: number;
}
export interface AuthProvider {
  exchangeCode(input: { readonly code: string; readonly verifier: string; readonly redirectUri: string }): Promise<TokenResult>;
  verifyIdToken(token: string): Promise<VerifiedIdentity>;
  refresh(input: { readonly sealedTokens: string }): Promise<TokenResult>;
  createEndSessionUrl(input: { readonly sealedTokens: string; readonly postLogoutRedirectUri: string; readonly state: string }): Promise<string>;
  verifyBackchannelLogoutToken(token: string): Promise<BackchannelIdentity>;
}
export interface AuthBffConfig {
  readonly plane: SessionPlane; readonly realmKey: string; readonly issuer: string; readonly clientId: string; readonly redirectUri: string;
  readonly authorizedRole: string; readonly configurationRevision: string; readonly store: SessionStore; readonly provider: AuthProvider;
  readonly sealTokens: (tokens: TokenResult) => Promise<string>; readonly now?: () => number; readonly production?: boolean;
  readonly resolveContexts?: (input: { readonly accessToken: string; readonly identity: VerifiedIdentity }) => Promise<readonly AuthContextOption[]>;
  readonly sessionKeyVersion?: number;
  readonly deriveCsrfToken?: (opaqueSessionId: string) => string;
  readonly deriveAcceptedCsrfTokens?: (opaqueSessionId: string) => readonly string[];
  readonly postLogoutRedirectUri?: string; readonly observeSecurityEvent?: (event: AuthSecurityEvent) => void;
  readonly verifyTrustedDevice?: (input: { readonly plane: SessionPlane; readonly realmKey: string; readonly tenantId: string; readonly principalId: string; readonly authEpoch: number; readonly deviceTokenHash: string; readonly sealedTokens: string; readonly effectiveAt: number }) => Promise<{ readonly active: boolean; readonly expiresAt?: number }>;
  readonly registerTrustedDevice?: (input: { readonly plane: SessionPlane; readonly realmKey: string; readonly tenantId: string; readonly principalId: string; readonly authEpoch: number; readonly deviceTokenHash: string; readonly sealedTokens: string; readonly ttlMs: number; readonly userAgent?: string }) => Promise<{ readonly expiresAt: number }>;
  readonly elevationTtlMs?: number;
  readonly trustedDeviceTtlMs?: number;
  readonly idleTtlMs?: number; readonly absoluteTtlMs?: number; readonly stateTtlMs?: number; readonly logoutStateTtlMs?: number;
  readonly logoutTokenMaxAgeMs?: number; readonly refreshLockTtlMs?: number;
}
export interface AuthHandlers {
  login(request: Request): Promise<Response>; callback(request: Request): Promise<Response>; logout(request: Request): Promise<Response>;
  logoutCallback(request: Request): Promise<Response>;
  session(request: Request): Promise<Response>; contexts(request: Request): Promise<Response>; context(request: Request): Promise<Response>; touch(request: Request): Promise<Response>;
  refresh(request: Request): Promise<Response>; backchannelLogout(request: Request): Promise<Response>;
  stepUpStart(request: Request): Promise<Response>; mfaVerify(request: Request): Promise<Response>;
}

/**
 * Converts failed browser callback navigations into a safe sign-in recovery
 * page. API clients still receive the original RFC 9457 problem response.
 */
export async function callbackNavigationResponse(request: Request, callback: (request: Request) => Promise<Response>, publicOrigin?: string): Promise<Response> {
  const response = await callback(request);
  if (!isDocumentNavigation(request) || !isProblemResponse(response)) return response;
  const destination = new URL("/sign-in", safePublicOrigin(publicOrigin) ?? request.url);
  destination.searchParams.set("reason", signInReason(response));
  const returnTo = response.headers.get("x-athyper-auth-return-to");
  if (returnTo) destination.searchParams.set("returnTo", sanitizeReturnTo(returnTo));
  const headers = new Headers(response.headers); headers.set("location", destination.toString()); headers.set("cache-control", "no-store"); headers.delete("content-type"); headers.delete("content-length");
  return new Response(null, { status: 303, headers });
}

/** Keeps browser form logout on a human recovery surface; API callers retain 204. */
export async function logoutNavigationResponse(request: Request, logout: (request: Request) => Promise<Response>, publicOrigin?: string): Promise<Response> {
  const response = await logout(request);
  if (!isDocumentNavigation(request)) return response;
  if (response.status >= 300 && response.status < 400 && response.headers.has("location")) return response;
  const destination = new URL("/sign-in", safePublicOrigin(publicOrigin) ?? request.url);
  destination.searchParams.set("reason", response.ok ? "signed-out" : "logout-incomplete");
  const headers = new Headers(response.headers);
  headers.set("location", destination.toString());
  headers.set("cache-control", "no-store");
  headers.delete("content-length");
  return new Response(null, { status: 303, headers });
}

/** Keeps invalid or expired provider logout callbacks on a safe human surface. */
export async function logoutCallbackNavigationResponse(request: Request, callback: (request: Request) => Promise<Response>, publicOrigin?: string): Promise<Response> {
  const response = await callback(request);
  if (!isDocumentNavigation(request) || !isProblemResponse(response)) return response;
  const destination = new URL("/sign-in?reason=logout-incomplete", safePublicOrigin(publicOrigin) ?? request.url);
  return new Response(null, { status: 303, headers: { location: destination.toString(), "cache-control": "no-store" } });
}

export async function createPkceTransaction(input: { readonly returnTo: string; readonly browserBinding: string; readonly now?: number }): Promise<PkceTransaction> {
  const verifier = randomBytes(32).toString("base64url");
  return Object.freeze({ state: randomBytes(24).toString("base64url"), nonce: randomBytes(24).toString("base64url"), verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), browserBindingHash: hashOpaqueSessionId(input.browserBinding), returnTo: sanitizeReturnTo(input.returnTo), createdAt: input.now ?? Date.now() });
}
export function validatePkceCallback(transaction: PkceTransaction, input: { readonly state: string; readonly now: number; readonly maxAgeMs?: number }): void {
  if (!timingSafeText(transaction.state, input.state)) throw new AuthFlowError("auth.invalid_state", 400, "OAuth state mismatch");
  if (input.now - transaction.createdAt > (input.maxAgeMs ?? 600_000) || transaction.createdAt > input.now) throw new AuthFlowError("auth.expired_state", 400, "OAuth transaction expired");
}

export function createAuthHandlers(config: AuthBffConfig): AuthHandlers {
  const binding: SessionBinding = { plane: config.plane, realmKey: config.realmKey }; const now = config.now ?? Date.now;
  const cookieName = config.production ? "__Host-athyper-session" : "athyper-session";
  const csrfCookieName = config.production ? "__Host-athyper-csrf" : "athyper-csrf";
  const oauthCookieName = config.production ? "__Host-athyper-oauth" : "athyper-oauth";
  const trustedCookieName = config.production ? "__Host-athyper-trusted-device" : "athyper-trusted-device";
  const idleTtl = config.idleTtlMs ?? 30 * 60_000; const absoluteTtl = config.absoluteTtlMs ?? 12 * 60 * 60_000; const stateTtl = config.stateTtlMs ?? 10 * 60_000;
  const logoutStateTtl = config.logoutStateTtlMs ?? 5 * 60_000; const logoutTokenMaxAge = config.logoutTokenMaxAgeMs ?? 5 * 60_000;
  const trustedDeviceTtl = config.trustedDeviceTtlMs ?? 30 * 24 * 60 * 60_000;
  if (!Number.isInteger(trustedDeviceTtl) || trustedDeviceTtl < 60_000 || trustedDeviceTtl > 90 * 24 * 60 * 60_000) throw new TypeError("trustedDeviceTtlMs must be between one minute and 90 days");
  const run = (handler: (request: Request) => Promise<Response>) => async (request: Request): Promise<Response> => { try { return await handler(request); } catch (cause) { return problemFrom(cause); } };
  const currentById = async (id: string) => { const stored = await config.store.read(binding, id); if (stored && stored.configurationRevision !== config.configurationRevision) { await config.store.revoke(binding, id); return undefined; } return stored; };
  const readSession = async (request: Request) => { const rawId = readCookie(request.headers.get("cookie"), cookieName); if (!rawId) return undefined; return currentById(hashOpaqueSessionId(rawId)); };
  const toSafe = (stored: StoredSession | undefined): SanitizedSession => {
    if (!stored) return { schemaVersion: 1, state: "anonymous", plane: config.plane, requiredActions: [], allowedNextActions: ["login"] };
    // Sessions written before requiredActions was added to schema v1 can
    // remain alive in Redis through a rolling deployment. Normalize them at
    // the trust boundary and always emit the canonical array on the wire.
    const requiredActions = Array.isArray(stored.requiredActions) ? stored.requiredActions : [];
    const state = requiredActions.length ? "required_action" as const : stored.tenantId ? "authenticated" as const : "context_required" as const;
    const result: SanitizedSession = { schemaVersion: 1, state, plane: stored.plane, realmKey: stored.realmKey, expiresAt: iso(Math.min(stored.idleExpiresAt, stored.absoluteExpiresAt)), idleExpiresAt: iso(stored.idleExpiresAt), absoluteExpiresAt: iso(stored.absoluteExpiresAt), accessExpiresAt: iso(stored.accessTokenExpiresAt), ...(stored.tenantId ? { tenantId: stored.tenantId, principalId: stored.principalId, authEpoch: stored.authEpoch } : {}), sessionVersion: stored.sessionVersion, configurationRevision: stored.configurationRevision, assurance: stored.assurance, elevationExpiresAt: stored.elevationExpiresAt ? iso(stored.elevationExpiresAt) : undefined, requiredActions };
    return { ...result, allowedNextActions: allowedNextActions(decideSession(result, now())) };
  };
  const login = run(async (request) => {
    const url = new URL(request.url); const browserBinding = randomBytes(32).toString("base64url"); const transaction = await createPkceTransaction({ returnTo: url.searchParams.get("returnTo") ?? "/", browserBinding, now: now() });
    await config.store.putOneTimeState(binding, oauthStateHash(transaction.state, transaction.browserBindingHash), JSON.stringify(transaction), stateTtl);
    const authorization = new URL(`${config.issuer.replace(/\/$/, "")}/protocol/openid-connect/auth`);
    authorization.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, scope: "openid organization:*", state: transaction.state, nonce: transaction.nonce, code_challenge: transaction.challenge, code_challenge_method: "S256" }).toString();
    authorization.searchParams.set("ui_locales", requestUiLocale(request, url));
    if (url.searchParams.get("mode") === "switch") authorization.searchParams.set("prompt", "select_account");
    return new Response(null, { status: 302, headers: { location: authorization.toString(), "cache-control": "no-store", "set-cookie": transientCookie(oauthCookieName, browserBinding, stateTtl, config.production) } });
  });
  const callback = async (request: Request): Promise<Response> => {
    let recoveryReturnTo: string | undefined;
    try {
      const url = new URL(request.url); const state = required(url.searchParams.get("state"), "state");
      const browserBinding = readCookie(request.headers.get("cookie"), oauthCookieName); if (!browserBinding) throw new AuthFlowError("auth.invalid_state", 400, "OAuth browser binding is missing");
      const suppliedBindingHash = hashOpaqueSessionId(browserBinding);
      const raw = await config.store.consumeOneTimeState(binding, oauthStateHash(state, suppliedBindingHash)); if (!raw) throw new AuthFlowError("auth.invalid_state", 400, "OAuth state is missing or already consumed");
      const transaction = JSON.parse(raw) as PkceTransaction; recoveryReturnTo = sanitizeReturnTo(transaction.returnTo); validatePkceCallback(transaction, { state, now: now(), maxAgeMs: stateTtl });
      if (!timingSafeText(suppliedBindingHash, transaction.browserBindingHash)) throw new AuthFlowError("auth.invalid_state", 400, "OAuth browser binding is invalid");
      const responseIssuer = url.searchParams.get("iss");
      if (responseIssuer && responseIssuer.replace(/\/$/, "") !== config.issuer.replace(/\/$/, "")) throw new AuthFlowError("auth.invalid_issuer", 400, "OAuth response issuer is invalid");
      const providerError = url.searchParams.get("error");
      if (providerError) throw providerCallbackError(providerError, url.searchParams.get("error_description"));
      const code = required(url.searchParams.get("code"), "code");
      const tokens = await config.provider.exchangeCode({ code, verifier: transaction.verifier, redirectUri: config.redirectUri });
      const identity = await config.provider.verifyIdToken(tokens.idToken); validateIdentity(identity, transaction, config, now());
      const availableContexts = config.resolveContexts ? await config.resolveContexts({ accessToken: tokens.accessToken, identity }) : undefined;
      if (availableContexts && availableContexts.length === 0) throw new AuthFlowError("auth.access_denied", 403, "No active plane membership is available");
      const selected = availableContexts?.length === 1 ? availableContexts[0] : undefined;
      const current = readCookie(request.headers.get("cookie"), cookieName); const rawId = randomBytes(32).toString("base64url"); const started = now(); const requiredActions = identity.requiredActions ?? [];
      if (transaction.purpose === "step_up") {
        validateStepUpAssurance(identity);
        const rawSessionId = readCookie(request.headers.get("cookie"), cookieName);
        const sessionIdHash = rawSessionId ? hashOpaqueSessionId(rawSessionId) : undefined;
        if (!sessionIdHash || !transaction.sessionIdHash || !timingSafeText(sessionIdHash, transaction.sessionIdHash)) throw new AuthFlowError("auth.step_up_session_changed", 401, "The session changed during step-up");
        const existing = await currentById(sessionIdHash);
        if (!existing || (existing.providerSubject && existing.providerSubject !== identity.subject) || (!existing.providerSubject && existing.providerSessionId !== identity.providerSessionId)) throw new AuthFlowError("auth.step_up_identity_changed", 403, "Step-up returned a different identity");
        const activeContext = availableContexts?.find((candidate) => candidate.tenantId === existing.tenantId && candidate.principalId === existing.principalId);
        if (availableContexts && !activeContext) throw new AuthFlowError("auth.access_denied", 403, "The active organization context is no longer available");
        const elevated = elevateSession(existing, started, config.elevationTtlMs);
        const sealedTokens = await config.sealTokens(tokens);
        let trustedDevice: { readonly token: string; readonly expiresAt: number } | undefined;
        if (transaction.rememberDevice) {
          if (!existing.tenantId || !config.registerTrustedDevice) throw new AuthFlowError("auth.trusted_device_unavailable", 503, "Trusted-device enrollment is unavailable");
          const token = randomBytes(32).toString("base64url");
          const enrolled = await config.registerTrustedDevice({ plane: config.plane, realmKey: config.realmKey, tenantId: existing.tenantId, principalId: existing.principalId, authEpoch: activeContext?.authEpoch ?? existing.authEpoch, deviceTokenHash: createHash("sha256").update(token, "utf8").digest("hex"), sealedTokens, ttlMs: trustedDeviceTtl, ...(request.headers.get("user-agent") ? { userAgent: request.headers.get("user-agent")!.slice(0, 2048) } : {}) });
          if (!Number.isFinite(enrolled.expiresAt) || enrolled.expiresAt <= started || enrolled.expiresAt > started + trustedDeviceTtl + 60_000) throw new AuthFlowError("auth.trusted_device_contract_invalid", 503, "Trusted-device enrollment returned an invalid expiry");
          trustedDevice = { token, expiresAt: enrolled.expiresAt };
        }
        const replacement: StoredSession = { ...elevated, authEpoch: activeContext?.authEpoch ?? existing.authEpoch, providerSubject: identity.subject, providerSessionId: identity.providerSessionId, encryptedTokenBundle: sealedTokens, accessTokenExpiresAt: tokens.accessTokenExpiresAt, requiredActions };
        await config.store.rotate(binding, sessionIdHash, hashOpaqueSessionId(rawId), replacement);
        return redirect(transaction.returnTo, [cookie(cookieName, rawId, config.production), ...(config.deriveCsrfToken ? [csrfCookie(csrfCookieName, config.deriveCsrfToken(rawId), config.production)] : []), ...(trustedDevice ? [persistentSecretCookie(trustedCookieName, trustedDevice.token, trustedDevice.expiresAt - started, config.production)] : []), clearCookie(oauthCookieName, config.production)]);
      }
      const session: StoredSession = { schemaVersion: 1, plane: config.plane, realmKey: config.realmKey, tenantId: availableContexts ? selected?.tenantId : identity.tenantId, availableContexts, principalId: selected?.principalId ?? identity.subject, providerSubject: identity.subject, providerSessionId: identity.providerSessionId, encryptedTokenBundle: await config.sealTokens(tokens), accessTokenExpiresAt: tokens.accessTokenExpiresAt, refreshGeneration: 0, authEpoch: selected?.authEpoch ?? 1, sessionVersion: 1, requiredActions, assurance: "baseline", createdAt: started, lastSeenAt: started, idleExpiresAt: Math.min(started + idleTtl, started + absoluteTtl), absoluteExpiresAt: started + absoluteTtl, configurationRevision: config.configurationRevision, keyVersion: config.sessionKeyVersion ?? 1 };
      await config.store.rotate(binding, current ? hashOpaqueSessionId(current) : undefined, hashOpaqueSessionId(rawId), session);
      return redirect(transaction.returnTo, [cookie(cookieName, rawId, config.production), ...(config.deriveCsrfToken ? [csrfCookie(csrfCookieName, config.deriveCsrfToken(rawId), config.production)] : []), clearCookie(oauthCookieName, config.production)]);
    } catch (cause) {
      const response = problemFrom(cause); if (recoveryReturnTo) response.headers.set("x-athyper-auth-return-to", recoveryReturnTo); response.headers.append("set-cookie", clearCookie(oauthCookieName, config.production)); return response;
    }
  };
  const logout = async (request: Request): Promise<Response> => {
    let unsafeRequestValidated = false;
    try {
      const command = await readLogoutCommand(request); const rawId = readCookie(request.headers.get("cookie"), cookieName);
      if (rawId && config.deriveCsrfToken) { validateUnsafeSessionRequest(request, new URL(config.redirectUri).origin, csrfExpectations(config, rawId), command.csrfToken); unsafeRequestValidated = true; }
      if (command.scope === "global") {
        if (!rawId || !config.postLogoutRedirectUri) throw new AuthFlowError("auth.unauthenticated", 401, "No authenticated session is available for global logout");
        const id = hashOpaqueSessionId(rawId); const current = await currentById(id);
        if (!current?.encryptedTokenBundle) throw new AuthFlowError("auth.unauthenticated", 401, "No authenticated session is available for global logout");
        const state = randomBytes(24).toString("base64url"); const startedAt = now();
        const endSessionUrl = await config.provider.createEndSessionUrl({ sealedTokens: current.encryptedTokenBundle, postLogoutRedirectUri: config.postLogoutRedirectUri, state });
        await config.store.putOneTimeState(binding, hashOpaqueSessionId(state), JSON.stringify({ kind: "logout", state, createdAt: startedAt }), logoutStateTtl);
        await config.store.revoke(binding, id);
        return withClearedCookies(Response.redirect(endSessionUrl, 303), cookieName, csrfCookieName, config.production);
      }
      if (rawId) await config.store.revoke(binding, hashOpaqueSessionId(rawId));
      return withClearedCookies(new Response(null, { status: 204, headers: { "cache-control": "no-store" } }), cookieName, csrfCookieName, config.production);
    } catch (cause) {
      const response = problemFrom(cause);
      return unsafeRequestValidated ? withClearedCookies(response, cookieName, csrfCookieName, config.production) : response;
    }
  };
  const logoutCallback = run(async (request) => {
    const state = required(new URL(request.url).searchParams.get("state"), "state");
    const raw = await config.store.consumeOneTimeState(binding, hashOpaqueSessionId(state)); if (!raw) throw new AuthFlowError("auth.invalid_logout_state", 400, "Logout state is missing or already consumed");
    const transaction = JSON.parse(raw) as { kind?: unknown; state?: unknown; createdAt?: unknown };
    if (transaction.kind !== "logout" || transaction.state !== state || typeof transaction.createdAt !== "number" || transaction.createdAt > now() || now() - transaction.createdAt > logoutStateTtl) throw new AuthFlowError("auth.invalid_logout_state", 400, "Logout state is invalid or expired");
    const destination = new URL("/sign-in?reason=signed-out-everywhere", config.postLogoutRedirectUri ?? request.url);
    return new Response(null, { status: 303, headers: { location: destination.toString(), "cache-control": "no-store" } });
  });
  const session = run(async (request) => json(toSafe(await readSession(request))));
  const contexts = run(async (request) => { const current = await readSession(request); if (!current) throw new AuthFlowError("auth.unauthenticated", 401, "No session"); return json({ schemaVersion: 1, plane: config.plane, contexts: current.availableContexts ?? [] }); });
  const touch = run(async (request) => { const rawId = readCookie(request.headers.get("cookie"), cookieName); if (!rawId) throw new AuthFlowError("auth.unauthenticated", 401, "No session"); if (config.deriveCsrfToken) validateUnsafeSessionRequest(request, new URL(config.redirectUri).origin, csrfExpectations(config, rawId)); const id = hashOpaqueSessionId(rawId); if (!await currentById(id)) throw new AuthFlowError("auth.unauthenticated", 401, "Session expired"); return json(toSafe(await config.store.touch(binding, id, idleTtl))); });
  const context = run(async (request) => {
    const rawId = readCookie(request.headers.get("cookie"), cookieName); if (!rawId) throw new AuthFlowError("auth.unauthenticated", 401, "No session"); const current = await currentById(hashOpaqueSessionId(rawId)); if (!current) throw new AuthFlowError("auth.unauthenticated", 401, "Session expired");
    if (config.deriveCsrfToken) validateUnsafeSessionRequest(request, new URL(config.redirectUri).origin, csrfExpectations(config, rawId));
    const body = await request.json() as { tenantId?: unknown }; const tenantId = required(typeof body.tenantId === "string" ? body.tenantId : null, "tenantId"); const selected = current.availableContexts?.find((candidate) => candidate.tenantId === tenantId); if (current.availableContexts && !selected) throw new AuthFlowError("auth.context_not_allowed", 403, "The selected context is not available"); const replacementId = randomBytes(32).toString("base64url"); const replacement = { ...current, tenantId, principalId: selected?.principalId ?? current.principalId, authEpoch: selected?.authEpoch ?? current.authEpoch, sessionVersion: current.sessionVersion + 1, assurance: "baseline" as const, elevationExpiresAt: undefined, lastSeenAt: now() };
    await config.store.rotate(binding, hashOpaqueSessionId(rawId), hashOpaqueSessionId(replacementId), replacement); const response = json(toSafe(replacement)); response.headers.append("set-cookie", cookie(cookieName, replacementId, config.production)); if (config.deriveCsrfToken) response.headers.append("set-cookie", csrfCookie(csrfCookieName, config.deriveCsrfToken(replacementId), config.production)); return response;
  });
  const refresh = run(async (request) => {
    const rawId = readCookie(request.headers.get("cookie"), cookieName); if (!rawId) throw new AuthFlowError("auth.unauthenticated", 401, "No session"); const id = hashOpaqueSessionId(rawId); const owner = randomUUID(); const lockTtl = config.refreshLockTtlMs ?? 15_000;
    if (request.method.toUpperCase() === "POST" && config.deriveCsrfToken) validateUnsafeSessionRequest(request, new URL(config.redirectUri).origin, csrfExpectations(config, rawId));
    if (!await config.store.acquireRefreshLock(binding, id, owner, lockTtl)) { const coalesced = await waitForRefresh(config.store, binding, id, now); return json(toSafe(coalesced)); }
    try { const current = await currentById(id); if (!current) throw new AuthFlowError("auth.unauthenticated", 401, "Session expired"); if (!current.encryptedTokenBundle) throw new AuthFlowError("auth.refresh_unavailable", 503, "Refresh material is unavailable"); let tokens: TokenResult; try { tokens = await config.provider.refresh({ sealedTokens: current.encryptedTokenBundle }); } catch (cause) { if (cause instanceof AuthFlowError && cause.code === "auth.refresh_rejected") { await config.store.revoke(binding, id); throw new AuthFlowError("auth.unauthenticated", 401, "The identity-provider session is no longer available"); } throw cause; } const updated: StoredSession = { ...current, encryptedTokenBundle: await config.sealTokens(tokens), accessTokenExpiresAt: tokens.accessTokenExpiresAt, refreshGeneration: current.refreshGeneration + 1, lastRefreshAt: now(), sessionVersion: current.sessionVersion + 1 };
      if (!await config.store.replaceAfterRefresh(binding, id, current.refreshGeneration, updated)) return json(toSafe(await config.store.read(binding, id))); return json(toSafe(updated));
    } finally { await config.store.releaseRefreshLock(binding, id, owner); }
  });
  const backchannelLogout = run(async (request) => { const contentType = request.headers.get("content-type") ?? ""; const body = contentType.includes("application/json") ? await request.json() as { logout_token?: string } : Object.fromEntries(new URLSearchParams(await request.text())); const token = required(body.logout_token, "logout_token"); const identity = await config.provider.verifyBackchannelLogoutToken(token); validateBackchannel(identity, config, now(), logoutTokenMaxAge); const claimed = await config.store.claimLogoutToken(binding, hashOpaqueSessionId(identity.tokenId), logoutTokenMaxAge); if (!claimed) { config.observeSecurityEvent?.({ type: "backchannel_logout", plane: config.plane, outcome: "replay", revokedSessions: 0 }); return new Response(null, { status: 204 }); } const revoked = await config.store.revokeProviderSession(binding, identity.providerSessionId); config.observeSecurityEvent?.({ type: "backchannel_logout", plane: config.plane, outcome: revoked > 0 ? "revoked" : "no_match", revokedSessions: revoked }); return new Response(null, { status: 204 }); });
  const elevateFromTrustedDevice = async (request: Request, requireDevice: boolean): Promise<Response | undefined> => {
    const rawId = readCookie(request.headers.get("cookie"), cookieName); if (!rawId) throw new AuthFlowError("auth.unauthenticated", 401, "No session");
    if (config.deriveCsrfToken) validateUnsafeSessionRequest(request, new URL(config.redirectUri).origin, csrfExpectations(config, rawId));
    const id = hashOpaqueSessionId(rawId); const current = await currentById(id);
    if (!current?.tenantId || !current.encryptedTokenBundle) throw new AuthFlowError("auth.unauthenticated", 401, "No active tenant session");
    const deviceToken = readCookie(request.headers.get("cookie"), trustedCookieName);
    if (!deviceToken || !config.verifyTrustedDevice) {
      if (requireDevice) throw new AuthFlowError("auth.step_up_required", 403, "Interactive step-up is required");
      return undefined;
    }
    const effectiveAt = now();
    const decision = await config.verifyTrustedDevice({ plane: config.plane, realmKey: config.realmKey, tenantId: current.tenantId, principalId: current.principalId, authEpoch: current.authEpoch, deviceTokenHash: createHash("sha256").update(deviceToken, "utf8").digest("hex"), sealedTokens: current.encryptedTokenBundle, effectiveAt });
    if (!decision.active || !decision.expiresAt || decision.expiresAt <= effectiveAt) {
      const denied = problemFrom(new AuthFlowError("auth.step_up_required", 403, "Interactive step-up is required"));
      denied.headers.append("set-cookie", clearCookie(trustedCookieName, config.production)); return denied;
    }
    const replacement = elevateSession(current, effectiveAt, config.elevationTtlMs, decision.expiresAt);
    const replacementId = randomBytes(32).toString("base64url");
    await config.store.rotate(binding, id, hashOpaqueSessionId(replacementId), replacement);
    const response = json(toSafe(replacement));
    response.headers.append("set-cookie", cookie(cookieName, replacementId, config.production));
    if (config.deriveCsrfToken) response.headers.append("set-cookie", csrfCookie(csrfCookieName, config.deriveCsrfToken(replacementId), config.production));
    return response;
  };
  const stepUpStart = run(async (request) => {
    const remembered = await elevateFromTrustedDevice(request, false); if (remembered) return remembered;
    const rawId = readCookie(request.headers.get("cookie"), cookieName); if (!rawId) throw new AuthFlowError("auth.unauthenticated", 401, "No session");
    const id = hashOpaqueSessionId(rawId); if (!await currentById(id)) throw new AuthFlowError("auth.unauthenticated", 401, "Session expired");
    const url = new URL(request.url); const browserBinding = randomBytes(32).toString("base64url"); const transaction = { ...(await createPkceTransaction({ returnTo: sanitizeReturnTo(url.searchParams.get("returnTo") ?? "/"), browserBinding, now: now() })), purpose: "step_up" as const, sessionIdHash: id, ...(url.searchParams.get("rememberDevice") === "true" ? { rememberDevice: true } : {}) };
    await config.store.putOneTimeState(binding, oauthStateHash(transaction.state, transaction.browserBindingHash), JSON.stringify(transaction), stateTtl);
    const authorization = new URL(`${config.issuer.replace(/\/$/, "")}/protocol/openid-connect/auth`);
    authorization.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, scope: "openid organization:*", state: transaction.state, nonce: transaction.nonce, code_challenge: transaction.challenge, code_challenge_method: "S256", prompt: "login", max_age: "0", acr_values: "urn:athyper:assurance:elevated" }).toString();
    authorization.searchParams.set("ui_locales", requestUiLocale(request, url));
    return new Response(null, { status: 302, headers: { location: authorization.toString(), "cache-control": "no-store", "set-cookie": transientCookie(oauthCookieName, browserBinding, stateTtl, config.production) } });
  });
  const mfaVerify = run((request) => elevateFromTrustedDevice(request, true).then((response) => response!));
  return { login, callback, logout, logoutCallback, session, contexts, context, touch, refresh, backchannelLogout, stepUpStart, mfaVerify };
}

function elevateSession(session: StoredSession, currentTime: number, configuredTtl?: number, trustedUntil?: number): StoredSession {
  const until = Math.min(session.absoluteExpiresAt, currentTime + (configuredTtl ?? 15 * 60_000), trustedUntil ?? Number.POSITIVE_INFINITY);
  if (until <= currentTime) throw new AuthFlowError("auth.step_up_required", 403, "Step-up assurance has expired");
  return { ...session, assurance: "elevated", elevationExpiresAt: until, sessionVersion: session.sessionVersion + 1, lastSeenAt: currentTime };
}

const ELEVATED_AUTHENTICATION_METHODS = new Set(["otp", "webauthn", "webauthn-passwordless", "fido", "fido2", "hwk", "mfa"]);
function validateStepUpAssurance(identity: VerifiedIdentity): void {
  const methods = identity.authenticationMethods?.map((method) => method.trim().toLowerCase()).filter(Boolean) ?? [];
  if (!methods.some((method) => ELEVATED_AUTHENTICATION_METHODS.has(method))) throw new AuthFlowError("auth.step_up_assurance_missing", 403, "The identity provider did not prove a second authentication factor");
}

function validateIdentity(identity: VerifiedIdentity, transaction: PkceTransaction, config: AuthBffConfig, now: number): void {
  if (identity.issuer.replace(/\/$/, "") !== config.issuer.replace(/\/$/, "")) fail("issuer"); if (!audienceHas(identity.audience, config.clientId)) fail("audience");
  if (!identity.nonce || !timingSafeText(identity.nonce, transaction.nonce)) fail("nonce"); if (identity.expiresAt <= now || identity.issuedAt > now + 30_000) fail("token time");
  if (identity.plane !== config.plane) fail("plane"); if (identity.realmKey !== config.realmKey) fail("realm"); if (!identity.roles.includes(config.authorizedRole)) fail("authorized role"); if (!identity.subject || !identity.providerSessionId) fail("required context");
}
function validateBackchannel(identity: BackchannelIdentity, config: AuthBffConfig, currentTime: number, maxAgeMs: number): void { const event = identity.events["http://schemas.openid.net/event/backchannel-logout"]; if (identity.issuer.replace(/\/$/, "") !== config.issuer.replace(/\/$/, "") || !audienceHas(identity.audience, config.clientId) || !event || typeof event !== "object" || identity.nonce !== undefined || !identity.tokenId || identity.issuedAt > currentTime + 30_000 || currentTime - identity.issuedAt > maxAgeMs || (identity.expiresAt !== undefined && identity.expiresAt <= currentTime)) fail("backchannel claims"); }
function validateUnsafeSessionRequest(request: Request, expectedOrigin: string, expectedCsrf: readonly string[], suppliedToken?: string): void {
  const origin = request.headers.get("origin"); const fetchSite = request.headers.get("sec-fetch-site"); const supplied = suppliedToken ?? request.headers.get("x-csrf-token");
  if (origin !== expectedOrigin || (fetchSite && fetchSite !== "same-origin") || !supplied || !expectedCsrf.some((candidate) => timingSafeText(supplied, candidate))) throw new AuthFlowError("auth.csrf_invalid", 403, "The session request could not be verified");
}
function csrfExpectations(config: AuthBffConfig, opaqueSessionId: string): readonly string[] { return config.deriveAcceptedCsrfTokens?.(opaqueSessionId) ?? (config.deriveCsrfToken ? [config.deriveCsrfToken(opaqueSessionId)] : []); }
function oauthStateHash(state: string, browserBindingHash: string): string { return hashOpaqueSessionId(`${state}.${browserBindingHash}`); }
async function waitForRefresh(store: SessionStore, binding: SessionBinding, id: string, now: () => number): Promise<StoredSession | undefined> { const initial = await store.read(binding, id); const generation = initial?.refreshGeneration; const until = now() + 2_000; while (now() < until) { await new Promise((resolve) => setTimeout(resolve, 25)); const current = await store.read(binding, id); if (!current || current.refreshGeneration !== generation) return current; } throw new AuthFlowError("auth.refresh_in_progress", 409, "Refresh remains in progress"); }
export class AuthFlowError extends Error { constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = "AuthFlowError"; } }
function problemFrom(cause: unknown): Response { const error = cause instanceof AuthFlowError ? cause : cause instanceof SessionStoreUnavailableError ? new AuthFlowError("auth.session_store_unavailable", 503, cause.message) : new AuthFlowError("auth.failed", 500, "Authentication request failed"); return new Response(JSON.stringify({ type: `https://athyper.dev/problems/${error.code}`, title: error.message, status: error.status, code: error.code }), { status: error.status, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } }); }
function isDocumentNavigation(request: Request): boolean {
  // OAuth callbacks are browser-navigation endpoints. Some reverse proxies do
  // not preserve Sec-Fetch-* headers, so only an explicit JSON preference opts
  // into a raw problem response. This prevents a dependency failure from ever
  // becoming a JSON document in a human browser.
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  return request.headers.get("sec-fetch-dest") === "document" || accept.includes("text/html") || !accept.includes("application/json");
}
function isProblemResponse(response: Response): boolean { return response.headers.get("content-type")?.includes("application/problem+json") === true; }
function signInReason(response: Response): string {
  // Browser-visible reasons are intentionally coarse: never expose identity
  // provider claim details, token data, or implementation errors in a URL.
  if (response.status === 408) return "expired";
  if (response.status === 401 || response.status === 403) return "access";
  if (response.status >= 500) return "service";
  return "retry";
}
function providerCallbackError(error: string, description: string | null): AuthFlowError {
  // Keycloak reports an expired authentication session as the OAuth pair
  // temporarily_unavailable/authentication_expired. Treat that as a normal,
  // recoverable timeout instead of either an access denial or a service outage.
  if (description === "authentication_expired" || error === "login_required") return new AuthFlowError("auth.authentication_expired", 408, "The authentication request expired");
  if (error === "access_denied") return new AuthFlowError("auth.access_denied", 403, "The authentication request was denied");
  if (error === "temporarily_unavailable") return new AuthFlowError("auth.provider_unavailable", 503, "The identity provider is temporarily unavailable");
  return new AuthFlowError("auth.provider_error", 400, "The identity provider could not complete authentication");
}
function safePublicOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined; } catch { return undefined; }
}
function fail(part: string): never { throw new AuthFlowError("auth.invalid_identity", 401, `Identity ${part} is invalid`); }
function audienceHas(value: string | readonly string[], expected: string): boolean { return typeof value === "string" ? value === expected : value.includes(expected); }
function timingSafeText(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); if (a.length !== b.length) return false; return createHash("sha256").update(a).digest().equals(createHash("sha256").update(b).digest()); }
function required<T>(value: T | null | undefined, name: string): T { if (value === null || value === undefined || value === "") throw new AuthFlowError("auth.invalid_request", 400, `${name} is required`); return value; }
async function readLogoutCommand(request: Request): Promise<{ readonly scope: "application" | "global"; readonly csrfToken?: string }> {
  const contentType = request.headers.get("content-type") ?? ""; let value: Record<string, unknown> = {};
  if (contentType.includes("application/json")) value = await request.json() as Record<string, unknown>;
  else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) value = Object.fromEntries((await request.formData()).entries());
  const rawScope = typeof value.scope === "string" ? value.scope : "application";
  if (rawScope !== "application" && rawScope !== "global") throw new AuthFlowError("auth.invalid_request", 400, "logout scope is invalid");
  const bodyCsrf = typeof value._csrf === "string" ? value._csrf : undefined;
  return { scope: rawScope, ...(bodyCsrf ? { csrfToken: bodyCsrf } : {}) };
}
function readCookie(header: string | null, name: string): string | undefined { return header?.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.slice(1).join("="); }
function requestUiLocale(request: Request, url = new URL(request.url)): "en" | "ar" { const requested=url.searchParams.get("ui_locale")??readCookie(request.headers.get("cookie"),"athyper_locale")??request.headers.get("accept-language")?.split(",")[0]?.split(";")[0];try{return new Intl.Locale(requested??"en").language.toLowerCase()==="ar"?"ar":"en";}catch{return"en";} }
export function readAuthCsrfCookie(cookieHeader: string | null, production = false): string | undefined { return readCookie(cookieHeader, production ? "__Host-athyper-csrf" : "athyper-csrf"); }
function cookie(name: string, value: string, production = false): string { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${production ? "; Secure" : ""}`; }
function transientCookie(name: string, value: string, ttlMs: number, production = false): string { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(1, Math.floor(ttlMs / 1_000))}${production ? "; Secure" : ""}`; }
function persistentSecretCookie(name: string, value: string, ttlMs: number, production = false): string { return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(1, Math.floor(ttlMs / 1_000))}${production ? "; Secure" : ""}`; }
function clearCookie(name: string, production = false, httpOnly = true): string { return `${name}=; Path=/;${httpOnly ? " HttpOnly;" : ""} SameSite=Lax; Max-Age=0${production ? "; Secure" : ""}`; }
function csrfCookie(name: string, value: string, production = false): string { return `${name}=${value}; Path=/; SameSite=Strict${production ? "; Secure" : ""}`; }
function withClearedCookies(response: Response, sessionCookie: string, csrfCookieName: string, production = false): Response { const headers = new Headers(response.headers); headers.append("set-cookie", clearCookie(sessionCookie, production)); headers.append("set-cookie", clearCookie(csrfCookieName, production, false)); headers.set("cache-control", "no-store"); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function redirect(location: string, setCookies: readonly string[]): Response { const response = new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } }); for (const value of setCookies) response.headers.append("set-cookie", value); return response; }
function json(value: unknown, status = 200, headers?: HeadersInit): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } }); }
function iso(value: number): string { return new Date(value).toISOString(); }
