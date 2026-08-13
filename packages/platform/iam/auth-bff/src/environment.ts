import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { createRedisClient, createRedisSessionStore, hashOpaqueSessionId, type SessionBinding, type SessionStore } from "@athyper/platform-iam-session-store";
import { createAuthHandlers, type AuthContextOption, type AuthHandlers, type AuthProvider, type BackchannelIdentity, type TokenResult, type VerifiedIdentity } from "./index";
import type { SessionPlane } from "@athyper/platform-iam-session";

export interface EnvironmentAuthOptions { readonly plane: SessionPlane; readonly clientId: string; readonly authorizedRole: string; readonly origin: string; readonly configurationRevision?: string; }
export interface EnvironmentRelaySession { readonly accessToken: string; readonly plane: SessionPlane; readonly realmKey: string; readonly tenantId?: string; readonly principalId: string; readonly authEpoch: number; readonly csrfToken: string; }
export interface EnvironmentAuthRuntime { readonly handlers: AuthHandlers; resolveRelaySession(request: Request): Promise<EnvironmentRelaySession | undefined>; refreshRelaySession(request: Request): Promise<EnvironmentRelaySession | undefined>; invalidateRelaySession(request: Request): Promise<void>; }

export function createEnvironmentAuthHandlers(options: EnvironmentAuthOptions): AuthHandlers {
  return createEnvironmentAuthRuntime(options).handlers;
}

export function createEnvironmentAuthRuntime(options: EnvironmentAuthOptions): EnvironmentAuthRuntime {
  let runtime: EnvironmentAuthRuntime | undefined; const get = () => runtime ??= buildRuntime(options);
  const handlers: AuthHandlers = {
    login: (request) => get().handlers.login(request), callback: (request) => get().handlers.callback(request), logout: (request) => get().handlers.logout(request),
    logoutCallback: (request) => get().handlers.logoutCallback(request),
    session: (request) => get().handlers.session(request), contexts: (request) => get().handlers.contexts(request), context: (request) => get().handlers.context(request), touch: (request) => get().handlers.touch(request),
    refresh: (request) => get().handlers.refresh(request), backchannelLogout: (request) => get().handlers.backchannelLogout(request),
    stepUpStart: (request) => get().handlers.stepUpStart(request), mfaVerify: (request) => get().handlers.mfaVerify(request),
  };
  return {
    handlers,
    resolveRelaySession: (request) => get().resolveRelaySession(request),
    refreshRelaySession: (request) => get().refreshRelaySession(request),
    invalidateRelaySession: (request) => get().invalidateRelaySession(request),
  };
}

function buildRuntime(options: EnvironmentAuthOptions): EnvironmentAuthRuntime {
  const redisUrl = requiredEnv("REDIS_URL"); const baseUrl = requiredEnv("KEYCLOAK_BASE_URL").replace(/\/$/, "");
  const realmKey = process.env[`${options.plane.toUpperCase()}_KEYCLOAK_REALM`] ?? process.env.KEYCLOAK_REALM ?? "athyper";
  const clientId = process.env[`${options.plane.toUpperCase()}_KEYCLOAK_CLIENT_ID`] ?? options.clientId; const keyVersion = numberEnv("SESSION_KEY_VERSION", 1);
  const issuer = `${baseUrl}/realms/${realmKey}`; const keyRing = decodeKeyRing(requiredEnv("SESSION_TOKEN_ENCRYPTION_KEY"), keyVersion, process.env.SESSION_TOKEN_PREVIOUS_KEYS);
  const store = createRedisSessionStore({ redis: createRedisClient(redisUrl), namespace: process.env.SESSION_REDIS_NAMESPACE ?? "athyper:session", keyVersion, observe: (metric) => process.stderr.write(`${JSON.stringify({ level: metric.outcome === "unavailable" ? "error" : "info", event: "auth.session_store", plane: options.plane, operation: metric.operation, outcome: metric.outcome, durationMs: metric.durationMs })}\n`) });
  const provider = keycloakProvider({ issuer, clientId, clientSecret: process.env.KEYCLOAK_CLIENT_SECRET, keyRing, plane: options.plane });
  const configurationRevision = options.configurationRevision ?? process.env.AUTH_CONFIGURATION_REVISION ?? "1"; const production = process.env.NODE_ENV === "production"; const binding: SessionBinding = { plane: options.plane, realmKey }; const sessionCookie = production ? "__Host-athyper-session" : "athyper-session";
  const deriveCsrfToken = (opaqueId: string) => createHmac("sha256", keyRing.keys.get(keyRing.currentVersion)!).update(`csrf:${opaqueId}`, "utf8").digest("base64url");
  const handlers = createAuthHandlers({ plane: options.plane, realmKey, issuer, clientId, redirectUri: `${options.origin}/api/auth/callback`, postLogoutRedirectUri: `${options.origin}/api/auth/logout/callback`, authorizedRole: options.authorizedRole, configurationRevision, store, provider, resolveContexts: ({ accessToken }) => discoverContexts(accessToken, options.plane, realmKey), sealTokens: (tokens) => Promise.resolve(seal(JSON.stringify(tokens), keyRing.currentVersion, keyRing.keys.get(keyRing.currentVersion)!)), sessionKeyVersion: keyVersion, deriveCsrfToken, production, observeSecurityEvent: (event) => process.stderr.write(`${JSON.stringify({ level: event.outcome === "no_match" ? "warn" : "info", event: "auth.backchannel_logout", ...event })}\n`) });
  const resolve = (request: Request) => resolveRelaySession({ request, store, binding, sessionCookie, configurationRevision, keyRing, deriveCsrfToken });
  return { handlers, resolveRelaySession: resolve, refreshRelaySession: async (request) => { const response = await handlers.refresh(request.clone()); return response.ok ? resolve(request) : undefined; }, invalidateRelaySession: async (request) => { const id = readCookie(request.headers.get("cookie"), sessionCookie); if (id) await store.revoke(binding, hashOpaqueSessionId(id)); } };
}

interface EncryptionKeyRing { readonly currentVersion: number; readonly keys: ReadonlyMap<number, Buffer>; }
function keycloakProvider(input: { issuer: string; clientId: string; clientSecret?: string; keyRing: EncryptionKeyRing; plane: SessionPlane }): AuthProvider {
  const jwks = createRemoteJWKSet(new URL(`${input.issuer}/protocol/openid-connect/certs`));
  const verify = (token: string) => jwtVerify(token, jwks, { issuer: input.issuer, audience: input.clientId, algorithms: ["RS256"] });
  const tokenRequest = async (body: URLSearchParams, previous?: TokenResult): Promise<TokenResult> => {
    body.set("client_id", input.clientId); if (input.clientSecret) body.set("client_secret", input.clientSecret);
    const response = await fetch(`${input.issuer}/protocol/openid-connect/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, cache: "no-store" });
    if (!response.ok) throw new Error(`Identity provider token exchange failed (${response.status})`); const value = await response.json() as Record<string, unknown>;
    return { accessToken: text(value.access_token, "access_token"), refreshToken: optionalText(value.refresh_token) ?? previous?.refreshToken, idToken: optionalText(value.id_token) ?? previous?.idToken ?? text(value.id_token, "id_token"), accessTokenExpiresAt: Date.now() + number(value.expires_in, "expires_in") * 1_000 };
  };
  return {
    exchangeCode: ({ code, verifier, redirectUri }) => tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri })),
    verifyIdToken: async (token) => toIdentity((await verify(token)).payload, input.plane),
    refresh: async ({ sealedTokens }) => { const previous = JSON.parse(open(sealedTokens, input.keyRing)) as TokenResult; if (!previous.refreshToken) throw new Error("No refresh token is available"); return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: previous.refreshToken }), previous); },
    createEndSessionUrl: async ({ sealedTokens, postLogoutRedirectUri, state }) => { const tokens = JSON.parse(open(sealedTokens, input.keyRing)) as TokenResult; const endpoint = new URL(`${input.issuer}/protocol/openid-connect/logout`); endpoint.search = new URLSearchParams({ id_token_hint: text(tokens.idToken, "id_token"), client_id: input.clientId, post_logout_redirect_uri: postLogoutRedirectUri, state }).toString(); return endpoint.toString(); },
    verifyBackchannelLogoutToken: async (token) => { const payload = (await verify(token)).payload; return { issuer: text(payload.iss, "iss"), audience: audience(payload.aud), providerSessionId: text(payload.sid, "sid"), issuedAt: number(payload.iat, "iat") * 1_000, ...(typeof payload.exp === "number" ? { expiresAt: payload.exp * 1_000 } : {}), tokenId: text(payload.jti, "jti"), ...(optionalText(payload.nonce) ? { nonce: optionalText(payload.nonce)! } : {}), events: object(payload.events, "events") } satisfies BackchannelIdentity; },
  };
}

function toIdentity(payload: JWTPayload, expectedPlane: SessionPlane): VerifiedIdentity {
  const realmAccess = objectOrEmpty(payload.realm_access); const roles = [...strings(realmAccess.roles), ...strings(payload.groups)];
  const planeAccess = strings(payload["athyper.plane_access"] ?? payload.plane_access);
  // The local realm's human users receive signed plane-gate realm roles.  A
  // client-scoped user attribute is optional metadata, so accept the matching
  // gate role as an equivalent signed plane assertion when that attribute is
  // absent. The later authorized-role check remains exact and fail-closed.
  const plane = planeAccess.includes(expectedPlane)
    ? expectedPlane
    : optionalText(payload.plane ?? payload.athyper_plane) ?? planeAccess[0] ?? planeFromGateRole(roles, expectedPlane) ?? "";
  return { issuer: text(payload.iss, "iss"), audience: audience(payload.aud), subject: text(payload.sub, "sub"), nonce: optionalText(payload.nonce), issuedAt: number(payload.iat, "iat") * 1_000, expiresAt: number(payload.exp, "exp") * 1_000, plane, realmKey: firstText(payload.realm_key ?? payload.realm ?? payload["athyper.realm_key"]) ?? issuerRealm(payload.iss) ?? "", tenantId: firstText(payload.tenant_id ?? payload.tenantId), providerSessionId: text(payload.sid, "sid"), roles, requiredActions: strings(payload.required_actions) };
}
function planeFromGateRole(roles: readonly string[], expectedPlane: SessionPlane): SessionPlane | undefined {
  const gateRole: Record<SessionPlane, string> = { neon: "NEON_USER", mesh: "MESH_BUYER_USER", studio: "STUDIO_USER" };
  return roles.includes(gateRole[expectedPlane]) ? expectedPlane : undefined;
}
function issuerRealm(issuer: unknown): string | undefined { return typeof issuer === "string" ? issuer.split("/").filter(Boolean).at(-1) : undefined; }
function seal(value: string, version: number, key: Buffer): string { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv); const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); return `v${version}.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`; }
function open(value: string, ring: EncryptionKeyRing): string { const match = /^v(\d+)\.(.+)$/.exec(value); if (!match) throw new Error("Invalid sealed token version"); const key = ring.keys.get(Number(match[1])); if (!key) throw new Error("Sealed token key version is unavailable"); const packed = Buffer.from(match[2]!, "base64url"); if (packed.length < 29) throw new Error("Invalid sealed token bundle"); const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12)); decipher.setAuthTag(packed.subarray(12, 28)); return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8"); }
function decodeKeyRing(current: string, version: number, previous?: string): EncryptionKeyRing { const keys = new Map<number, Buffer>([[version, decodeEncryptionKey(current)]]); if (previous) { const parsed = JSON.parse(previous) as Record<string, unknown>; for (const [rawVersion, rawKey] of Object.entries(parsed)) { const keyVersion = Number(rawVersion); if (!Number.isInteger(keyVersion) || typeof rawKey !== "string") throw new TypeError("SESSION_TOKEN_PREVIOUS_KEYS must map numeric versions to base64 keys"); keys.set(keyVersion, decodeEncryptionKey(rawKey)); } } return { currentVersion: version, keys }; }
function decodeEncryptionKey(value: string): Buffer { const key = Buffer.from(value, "base64"); if (key.length !== 32) throw new TypeError("SESSION_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key"); return key; }
function requiredEnv(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required; authentication fails closed without it`); return value; }
function numberEnv(name: string, fallback: number): number { const raw = process.env[name]; if (!raw) return fallback; const value = Number(raw); if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`); return value; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }
function firstText(value: unknown): string | undefined { return optionalText(value) ?? (Array.isArray(value) ? value.find((item): item is string => typeof item === "string" && !!item.trim()) : undefined); }
function number(value: unknown, name: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be numeric`); return value; }
function strings(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function audience(value: unknown): string | readonly string[] { if (typeof value === "string") return value; if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value; throw new TypeError("aud is required"); }
function object(value: unknown, name: string): Readonly<Record<string, unknown>> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Readonly<Record<string, unknown>>; }
function objectOrEmpty(value: unknown): Readonly<Record<string, unknown>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}; }
async function resolveRelaySession(input: { request: Request; store: SessionStore; binding: SessionBinding; sessionCookie: string; configurationRevision: string; keyRing: EncryptionKeyRing; deriveCsrfToken: (id: string) => string }): Promise<EnvironmentRelaySession | undefined> { const opaqueId = readCookie(input.request.headers.get("cookie"), input.sessionCookie); if (!opaqueId) return undefined; const id = hashOpaqueSessionId(opaqueId); const stored = await input.store.read(input.binding, id); if (!stored || stored.configurationRevision !== input.configurationRevision || !stored.encryptedTokenBundle) { if (stored) await input.store.revoke(input.binding, id); return undefined; } const tokens = JSON.parse(open(stored.encryptedTokenBundle, input.keyRing)) as TokenResult; return { accessToken: tokens.accessToken, plane: stored.plane, realmKey: stored.realmKey, tenantId: stored.tenantId, principalId: stored.principalId, authEpoch: stored.authEpoch, csrfToken: input.deriveCsrfToken(opaqueId) }; }
async function discoverContexts(accessToken: string, plane: SessionPlane, realmKey: string): Promise<readonly AuthContextOption[]> { const runtime = requiredEnv("RUNTIME_API_URL").replace(/\/+$/, ""); const response = await fetch(`${runtime}/api/iam/contexts`, { headers: { authorization: `Bearer ${accessToken}`, "x-plane": plane, "x-realm": realmKey, accept: "application/json" }, cache: "no-store" }); if (!response.ok) throw new Error(`Identity context discovery failed (${response.status})`); const value = await response.json() as { contexts?: unknown }; if (!Array.isArray(value.contexts)) throw new Error("Identity context discovery returned an invalid contract"); return value.contexts.map(parseContext); }
function parseContext(value: unknown): AuthContextOption { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Identity context is invalid"); const item = value as Record<string, unknown>; return Object.freeze({ tenantId: text(item.tenantId, "tenantId"), tenantCode: text(item.tenantCode, "tenantCode"), tenantName: text(item.tenantName, "tenantName"), principalId: text(item.principalId, "principalId"), ...(optionalText(item.description) ? { description: optionalText(item.description)! } : {}), ...(strings(item.badges).length ? { badges: strings(item.badges) } : {}) }); }
function readCookie(header: string | null, name: string): string | undefined { return header?.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.slice(1).join("="); }
