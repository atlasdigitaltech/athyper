import { parseInstant } from "@athyper/platform-temporal";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { createRedisClient, createRedisSessionStore, hashOpaqueSessionId, type SessionBinding, type SessionStore } from "@athyper/platform-iam-session-store";
import { AuthFlowError, clearedAuthSessionCookies, createAuthHandlers, type AuthContextOption, type AuthHandlers, type AuthProvider, type BackchannelIdentity, type TokenResult, type VerifiedIdentity } from "./index";
import { shouldTouchSession, type SessionPlane } from "@athyper/platform-iam-session";

/** Mirrors the effective Keycloak realm/client session policy in realm-athyper.json. */
export const KEYCLOAK_SESSION_TTLS_MS = Object.freeze({
  neon: Object.freeze({ idleTtlMs: 30 * 60_000, absoluteTtlMs: 10 * 60 * 60_000 }),
  mesh: Object.freeze({ idleTtlMs: 30 * 60_000, absoluteTtlMs: 10 * 60 * 60_000 }),
  studio: Object.freeze({ idleTtlMs: 15 * 60_000, absoluteTtlMs: 4 * 60 * 60_000 }),
} satisfies Readonly<Record<SessionPlane, Readonly<{ idleTtlMs: number; absoluteTtlMs: number }>>>);

export interface EnvironmentAuthOptions { readonly plane: SessionPlane; readonly clientId: string; readonly authorizedRole: string; readonly origin: string; readonly idleTtlMs: number; readonly absoluteTtlMs: number; readonly configurationRevision?: string; readonly trustedDeviceTtlMs?: number; }
export interface EnvironmentRelaySession { readonly accessToken: string; readonly plane: SessionPlane; readonly realmKey: string; readonly tenantId?: string; readonly principalId: string; readonly authEpoch: number; readonly assurance: "baseline" | "elevated"; readonly csrfToken: string; readonly acceptedCsrfTokens: readonly string[]; }
export interface EnvironmentAuthRuntime { readonly handlers: AuthHandlers; resolveRelaySession(request: Request): Promise<EnvironmentRelaySession | undefined>; refreshRelaySession(request: Request): Promise<EnvironmentRelaySession | undefined>; invalidateRelaySession(request: Request): Promise<readonly string[]>; }

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
  validateSessionTtls(options.idleTtlMs, options.absoluteTtlMs);
  const redisUrl = requiredEnv("REDIS_URL"); const baseUrl = requiredEnv("KEYCLOAK_BASE_URL").replace(/\/$/, "");
  const internalBaseUrl = (process.env.KEYCLOAK_INTERNAL_BASE_URL?.trim() || baseUrl).replace(/\/$/, "");
  const realmKey = process.env[`${options.plane.toUpperCase()}_KEYCLOAK_REALM`] ?? process.env.KEYCLOAK_REALM ?? "athyper";
  const clientId = process.env[`${options.plane.toUpperCase()}_KEYCLOAK_CLIENT_ID`] ?? options.clientId; const keyVersion = numberEnv("SESSION_KEY_VERSION", 1); const storeVersion = numberEnv("SESSION_STORE_VERSION", 1);
  const issuer = `${baseUrl}/realms/${realmKey}`; const internalIssuer = `${internalBaseUrl}/realms/${realmKey}`; const keyRing = decodeKeyRing(requiredEnv("SESSION_TOKEN_ENCRYPTION_KEY"), keyVersion, process.env.SESSION_TOKEN_PREVIOUS_KEYS);
  const trustedDeviceTtlMs = options.trustedDeviceTtlMs ?? numberEnv("AUTH_TRUSTED_DEVICE_TTL_DAYS", 30) * 24 * 60 * 60_000;
  const store = createRedisSessionStore({ redis: createRedisClient(redisUrl), namespace: process.env.SESSION_REDIS_NAMESPACE ?? "athyper:session", namespaceVersion: storeVersion, observe: (metric) => process.stderr.write(`${JSON.stringify({ level: metric.outcome === "unavailable" ? "error" : "info", event: "auth.session_store", plane: options.plane, operation: metric.operation, outcome: metric.outcome, durationMs: metric.durationMs })}\n`) });
  const provider = keycloakProvider({ issuer, internalIssuer, clientId, clientSecret: process.env[`${options.plane.toUpperCase()}_KEYCLOAK_CLIENT_SECRET`] ?? process.env.KEYCLOAK_CLIENT_SECRET, keyRing, plane: options.plane });
  const configurationRevision = options.configurationRevision ?? process.env.AUTH_CONFIGURATION_REVISION ?? "1"; const production = process.env.NODE_ENV === "production"; const binding: SessionBinding = { plane: options.plane, realmKey }; const sessionCookie = production ? "__Host-athyper-session" : "athyper-session";
  const deriveCsrfToken = (opaqueId: string) => createHmac("sha256", keyRing.keys.get(keyRing.currentVersion)!).update(`csrf:${opaqueId}`, "utf8").digest("base64url");
  const deriveAcceptedCsrfTokens = (opaqueId: string) => [...keyRing.keys.values()].map((key) => createHmac("sha256", key).update(`csrf:${opaqueId}`, "utf8").digest("base64url"));
  const handlers = createAuthHandlers({ plane: options.plane, realmKey, issuer, clientId, redirectUri: `${options.origin}/api/auth/callback`, postLogoutRedirectUri: `${options.origin}/api/auth/logout/callback`, authorizedRole: options.authorizedRole, configurationRevision, store, provider, resolveContexts: ({ accessToken }) => discoverContexts(accessToken, options.plane, realmKey), verifyTrustedDevice: (input) => verifyTrustedDevice(input, keyRing), registerTrustedDevice: (input) => registerTrustedDevice(input, keyRing), sealTokens: (tokens) => Promise.resolve(seal(JSON.stringify(tokens), keyRing.currentVersion, keyRing.keys.get(keyRing.currentVersion)!)), sessionKeyVersion: keyVersion, deriveCsrfToken, deriveAcceptedCsrfTokens, idleTtlMs: options.idleTtlMs, absoluteTtlMs: options.absoluteTtlMs, trustedDeviceTtlMs, production, observeSecurityEvent: (event) => process.stderr.write(`${JSON.stringify({ level: event.outcome === "no_match" ? "warn" : "info", event: "auth.backchannel_logout", ...event })}\n`) });
  const resolve = (request: Request) => resolveRelaySession({ request, store, binding, sessionCookie, configurationRevision, keyRing, deriveCsrfToken, idleTtlMs: options.idleTtlMs });
  return { handlers, resolveRelaySession: resolve, refreshRelaySession: async (request) => { const response = await handlers.refresh(request.clone()); return response.ok ? resolve(request) : undefined; }, invalidateRelaySession: async (request) => { const id = readCookie(request.headers.get("cookie"), sessionCookie); if (id) await store.revoke(binding, hashOpaqueSessionId(id)); return clearedAuthSessionCookies(production); } };
}

interface EncryptionKeyRing { readonly currentVersion: number; readonly keys: ReadonlyMap<number, Buffer>; }
function keycloakProvider(input: { issuer: string; internalIssuer: string; clientId: string; clientSecret?: string; keyRing: EncryptionKeyRing; plane: SessionPlane }): AuthProvider {
  const jwks = createRemoteJWKSet(new URL(`${input.internalIssuer}/protocol/openid-connect/certs`));
  const verify = (token: string) => jwtVerify(token, jwks, { issuer: input.issuer, audience: input.clientId, algorithms: ["RS256"] });
  const tokenRequest = async (body: URLSearchParams, previous?: TokenResult): Promise<TokenResult> => {
    body.set("client_id", input.clientId); if (input.clientSecret) body.set("client_secret", input.clientSecret);
    const response = await fetch(`${input.internalIssuer}/protocol/openid-connect/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, cache: "no-store" });
    if (!response.ok) { const error = await response.json().catch(() => ({})) as Record<string, unknown>; if (error.error === "invalid_grant") throw new AuthFlowError("auth.refresh_rejected", 401, "The identity-provider grant is no longer available"); throw new Error(`Identity provider token exchange failed (${response.status})`); } const value = await response.json() as Record<string, unknown>;
    return { accessToken: text(value.access_token, "access_token"), refreshToken: optionalText(value.refresh_token) ?? previous?.refreshToken, idToken: optionalText(value.id_token) ?? previous?.idToken ?? text(value.id_token, "id_token"), accessTokenExpiresAt: Date.now() + number(value.expires_in, "expires_in") * 1_000 };
  };
  return {
    exchangeCode: ({ code, verifier, redirectUri }) => tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri })),
    verifyIdToken: async (token) => toIdentity((await verify(token)).payload, input.plane, input.clientId),
    refresh: async ({ sealedTokens }) => { const previous = JSON.parse(open(sealedTokens, input.keyRing)) as TokenResult; if (!previous.refreshToken) throw new Error("No refresh token is available"); return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: previous.refreshToken }), previous); },
    createEndSessionUrl: async ({ sealedTokens, postLogoutRedirectUri, state }) => { const tokens = JSON.parse(open(sealedTokens, input.keyRing)) as TokenResult; const endpoint = new URL(`${input.issuer}/protocol/openid-connect/logout`); endpoint.search = new URLSearchParams({ id_token_hint: text(tokens.idToken, "id_token"), client_id: input.clientId, post_logout_redirect_uri: postLogoutRedirectUri, state }).toString(); return endpoint.toString(); },
    verifyBackchannelLogoutToken: async (token) => { const payload = (await verify(token)).payload; return { issuer: text(payload.iss, "iss"), audience: audience(payload.aud), providerSessionId: text(payload.sid, "sid"), issuedAt: number(payload.iat, "iat") * 1_000, ...(typeof payload.exp === "number" ? { expiresAt: payload.exp * 1_000 } : {}), tokenId: text(payload.jti, "jti"), ...(optionalText(payload.nonce) ? { nonce: optionalText(payload.nonce)! } : {}), events: object(payload.events, "events") } satisfies BackchannelIdentity; },
  };
}

function toIdentity(payload: JWTPayload, expectedPlane: SessionPlane, clientId: string): VerifiedIdentity {
  const realmAccess = objectOrEmpty(payload.realm_access);
  const resourceAccess = objectOrEmpty(payload.resource_access);
  const clientAccess = objectOrEmpty(resourceAccess[clientId]);
  const roles = [...new Set([...strings(realmAccess.roles), ...strings(payload.groups), ...strings(clientAccess.roles)])];
  const authenticationMethods = [...new Set(strings(payload.amr).map((method) => method.trim().toLowerCase()).filter(Boolean))];
  const assurance = elevatedAssurance(payload, authenticationMethods) ? "elevated" as const : "baseline" as const;
  const planeAccess = strings(payload["athyper.plane_access"] ?? payload.plane_access);
  const plane = planeAccess.includes(expectedPlane)
    ? expectedPlane
    : optionalText(payload.plane ?? payload.athyper_plane) ?? planeAccess[0] ?? "";
  return { issuer: text(payload.iss, "iss"), audience: audience(payload.aud), subject: text(payload.sub, "sub"), nonce: optionalText(payload.nonce), issuedAt: number(payload.iat, "iat") * 1_000, expiresAt: number(payload.exp, "exp") * 1_000, plane, realmKey: firstText(payload.realm_key ?? payload.realm ?? payload["athyper.realm_key"]) ?? issuerRealm(payload.iss) ?? "", tenantId: firstText(payload.tenant_id ?? payload.tenantId), providerSessionId: text(payload.sid, "sid"), roles, requiredActions: strings(payload.required_actions), assurance, authenticationMethods };
}
function elevatedAssurance(payload: JWTPayload, methods: readonly string[]): boolean { if (methods.some((method) => ["otp", "webauthn", "webauthn-passwordless", "fido", "fido2", "hwk", "mfa"].includes(method))) return true; const acr = optionalText(payload.acr); return acr === "urn:athyper:assurance:elevated" || (acr !== undefined && /^\d+$/.test(acr) && Number(acr) >= 2); }
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
async function resolveRelaySession(input: { request: Request; store: SessionStore; binding: SessionBinding; sessionCookie: string; configurationRevision: string; keyRing: EncryptionKeyRing; deriveCsrfToken: (id: string) => string; idleTtlMs: number }): Promise<EnvironmentRelaySession | undefined> { const opaqueId = readCookie(input.request.headers.get("cookie"), input.sessionCookie); if (!opaqueId) return undefined; const id = hashOpaqueSessionId(opaqueId); let stored = await input.store.read(input.binding, id); if (!stored || stored.configurationRevision !== input.configurationRevision || !stored.encryptedTokenBundle) { if (stored) await input.store.revoke(input.binding, id); return undefined; } const currentTime = Date.now(); if (shouldTouchSession({ now: currentTime, lastSeenAt: stored.lastSeenAt, idleExpiresAt: stored.idleExpiresAt, minimumIntervalMs: 60_000, idleTtlMs: input.idleTtlMs })) { stored = await input.store.touch(input.binding, id, input.idleTtlMs); if (!stored?.encryptedTokenBundle) return undefined; } const tokens = JSON.parse(open(stored.encryptedTokenBundle, input.keyRing)) as TokenResult; const acceptedCsrfTokens = [...input.keyRing.keys.values()].map((key) => createHmac("sha256", key).update(`csrf:${opaqueId}`, "utf8").digest("base64url")); const assurance = stored.assurance === "elevated" && (stored.elevationExpiresAt ?? 0) > currentTime ? "elevated" as const : "baseline" as const; return { accessToken: tokens.accessToken, plane: stored.plane, realmKey: stored.realmKey, tenantId: stored.tenantId, principalId: stored.principalId, authEpoch: stored.authEpoch, assurance, csrfToken: input.deriveCsrfToken(opaqueId), acceptedCsrfTokens }; }
async function discoverContexts(accessToken: string, plane: SessionPlane, realmKey: string): Promise<readonly AuthContextOption[]> {
  const runtime = requiredEnv("RUNTIME_API_URL").replace(/\/+$/, "");
  const admission = accessTokenAdmissionSummary(accessToken, plane);
  const response = await fetch(`${runtime}/api/iam/contexts`, {
    headers: { authorization: `Bearer ${accessToken}`, "x-plane": plane, "x-realm": realmKey, accept: "application/json" },
    cache: "no-store",
  });
  const value = await response.json().catch(() => ({})) as { contexts?: unknown; code?: unknown };
  process.stderr.write(`${JSON.stringify({
    level: response.ok ? "info" : "warn",
    event: "auth.context_discovery",
    plane,
    status: response.status,
    outcome: response.ok ? "ok" : "rejected",
    problemCode: typeof value.code === "string" ? value.code : undefined,
    contextCount: Array.isArray(value.contexts) ? value.contexts.length : undefined,
    ...admission,
  })}\n`);
  if (!response.ok) {
    if (response.status === 401) throw new AuthFlowError("auth.unauthenticated", 401, "Identity context authentication was rejected");
    if (response.status === 403) throw new AuthFlowError("auth.access_denied", 403, "Identity context access was rejected");
    throw new AuthFlowError("auth.context_directory_unavailable", 503, "Identity context discovery is unavailable");
  }
  if (!Array.isArray(value.contexts)) throw new AuthFlowError("auth.context_contract_invalid", 503, "Identity context discovery returned an invalid contract");
  return value.contexts.map(parseContext);
}

function accessTokenAdmissionSummary(accessToken: string, plane: SessionPlane): Readonly<Record<string, unknown>> {
  try {
    const encoded = accessToken.split(".")[1];
    if (!encoded) return { tokenSummary: "unavailable" };
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
    const organization = payload.organization;
    const organizationIds = typeof organization === "string"
      ? [organization]
      : Array.isArray(organization)
        ? organization.filter((item): item is string => typeof item === "string")
        : organization && typeof organization === "object"
          ? Object.keys(organization)
          : [];
    const resourceAccess = objectOrEmpty(payload.resource_access);
    const clientAccess = objectOrEmpty(resourceAccess[`${plane}-web`]);
    return {
      authorizedParty: optionalText(payload.azp),
      authorizedRolePresent: strings(clientAccess.roles).includes("AUTHORIZED"),
      organizationIds,
    };
  } catch {
    return { tokenSummary: "unavailable" };
  }
}
async function verifyTrustedDevice(input: { plane: SessionPlane; realmKey: string; tenantId: string; principalId: string; authEpoch: number; deviceTokenHash: string; sealedTokens: string; effectiveAt: number }, keyRing: EncryptionKeyRing): Promise<{ active: boolean; expiresAt?: number }> {
  const runtime = requiredEnv("RUNTIME_API_URL").replace(/\/+$/, "");
  const tokens = JSON.parse(open(input.sealedTokens, keyRing)) as TokenResult;
  const response = await fetch(`${runtime}/api/iam/trusted-devices/verify`, { method: "POST", headers: { authorization: `Bearer ${tokens.accessToken}`, "x-plane": input.plane, "x-realm": input.realmKey, "x-tenant-id": input.tenantId, "x-auth-epoch": String(input.authEpoch), "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ deviceTokenHash: input.deviceTokenHash }), cache: "no-store" });
  if (response.status === 401) throw new AuthFlowError("auth.unauthenticated", 401, "Trusted-device authentication was rejected");
  if (response.status === 403) return { active: false };
  if (!response.ok) throw new AuthFlowError("auth.trusted_device_unavailable", 503, "Trusted-device verification is unavailable");
  const value = await response.json() as { active?: unknown; expiresAt?: unknown; tenantId?: unknown; principalId?: unknown };
  const expiresAt = typeof value.expiresAt === "string" ? parseInstant(value.expiresAt) : Number.NaN;
  return value.active === true && value.tenantId === input.tenantId && value.principalId === input.principalId && Number.isFinite(expiresAt) && expiresAt > input.effectiveAt ? { active: true, expiresAt } : { active: false };
}
async function registerTrustedDevice(input: { plane: SessionPlane; realmKey: string; tenantId: string; principalId: string; authEpoch: number; deviceTokenHash: string; sealedTokens: string; ttlMs: number; userAgent?: string }, keyRing: EncryptionKeyRing): Promise<{ expiresAt: number }> {
  const runtime = requiredEnv("RUNTIME_API_URL").replace(/\/+$/, "");
  const tokens = JSON.parse(open(input.sealedTokens, keyRing)) as TokenResult;
  const response = await fetch(`${runtime}/api/iam/trusted-devices`, { method: "POST", headers: { authorization: `Bearer ${tokens.accessToken}`, "x-plane": input.plane, "x-realm": input.realmKey, "x-tenant-id": input.tenantId, "x-auth-epoch": String(input.authEpoch), "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ deviceTokenHash: input.deviceTokenHash, ttlSeconds: Math.max(60, Math.floor(input.ttlMs / 1_000)), ...(input.userAgent ? { userAgent: input.userAgent } : {}) }), cache: "no-store" });
  if (response.status === 401) throw new AuthFlowError("auth.unauthenticated", 401, "Trusted-device enrollment authentication was rejected");
  if (response.status === 403) throw new AuthFlowError("auth.access_denied", 403, "Trusted-device enrollment context was rejected");
  if (!response.ok) throw new AuthFlowError("auth.trusted_device_unavailable", 503, "Trusted-device enrollment is unavailable");
  const value = await response.json() as { expiresAt?: unknown; tenantId?: unknown; principalId?: unknown };
  const expiresAt = typeof value.expiresAt === "string" ? parseInstant(value.expiresAt) : Number.NaN;
  if (value.tenantId !== input.tenantId || value.principalId !== input.principalId || !Number.isFinite(expiresAt)) throw new AuthFlowError("auth.trusted_device_contract_invalid", 503, "Trusted-device enrollment returned an invalid contract");
  return { expiresAt };
}
function parseContext(value: unknown): AuthContextOption { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Identity context is invalid"); const item = value as Record<string, unknown>; const authEpoch = number(item.authEpoch, "authEpoch"); return Object.freeze({ tenantId: text(item.tenantId, "tenantId"), tenantCode: text(item.tenantCode, "tenantCode"), tenantName: text(item.tenantName, "tenantName"), principalId: text(item.principalId, "principalId"), authEpoch, ...(optionalText(item.description) ? { description: optionalText(item.description)! } : {}), ...(strings(item.badges).length ? { badges: strings(item.badges) } : {}) }); }
function readCookie(header: string | null, name: string): string | undefined { return header?.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.slice(1).join("="); }
function validateSessionTtls(idleTtlMs: number, absoluteTtlMs: number): void { if (!Number.isInteger(idleTtlMs) || idleTtlMs < 1) throw new TypeError("idleTtlMs must be a positive integer"); if (!Number.isInteger(absoluteTtlMs) || absoluteTtlMs < idleTtlMs) throw new TypeError("absoluteTtlMs must be an integer greater than or equal to idleTtlMs"); }
