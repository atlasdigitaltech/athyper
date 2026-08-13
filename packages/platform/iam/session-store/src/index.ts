import { createHash } from "node:crypto";
import Redis from "ioredis";
import type { AssuranceLevel, SessionPlane } from "@athyper/platform-iam-session";

export interface StoredSession {
  readonly schemaVersion: 1;
  readonly plane: SessionPlane;
  readonly realmKey: string;
  readonly tenantId?: string;
  readonly availableContexts?: readonly StoredSessionContext[];
  readonly principalId: string;
  readonly providerSessionId: string;
  readonly encryptedTokenBundle?: string;
  readonly opaqueTokenReference?: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshGeneration: number;
  readonly lastRefreshAt?: number;
  readonly authEpoch: number;
  readonly sessionVersion: number;
  readonly requiredActions: readonly string[];
  readonly assurance: AssuranceLevel;
  readonly elevationExpiresAt?: number;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly idleExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly configurationRevision: string;
  readonly keyVersion: number;
}

export interface StoredSessionContext {
  readonly tenantId: string;
  readonly tenantCode: string;
  readonly tenantName: string;
  readonly principalId: string;
  readonly description?: string;
  readonly badges?: readonly string[];
}

export interface SessionBinding { readonly plane: SessionPlane; readonly realmKey: string; }
export interface SessionStoreMetric { readonly operation: string; readonly outcome: "ok" | "miss" | "unavailable" | "contended"; readonly durationMs: number; }
export interface RedisLike {
  readonly status?: string;
  connect?(): Promise<unknown>;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set: Redis["set"];
  eval: Redis["eval"];
  quit?(): Promise<unknown>;
}
export interface RedisSessionStoreOptions { readonly redis: RedisLike; readonly namespace?: string; readonly keyVersion?: number; readonly touchIntervalMs?: number; readonly now?: () => number; readonly observe?: (metric: SessionStoreMetric) => void; }
export interface SessionStore {
  health(): Promise<void>;
  create(sessionIdHash: string, session: StoredSession): Promise<void>;
  read(binding: SessionBinding, sessionIdHash: string): Promise<StoredSession | undefined>;
  rotate(binding: SessionBinding, oldHash: string | undefined, newHash: string, session: StoredSession): Promise<void>;
  revoke(binding: SessionBinding, sessionIdHash: string): Promise<boolean>;
  revokePrincipal(binding: SessionBinding, principalId: string): Promise<number>;
  revokeProviderSession(binding: SessionBinding, providerSessionId: string): Promise<number>;
  putOneTimeState(binding: SessionBinding, stateHash: string, value: string, ttlMs: number): Promise<void>;
  consumeOneTimeState(binding: SessionBinding, stateHash: string): Promise<string | undefined>;
  claimLogoutToken(binding: SessionBinding, tokenHash: string, ttlMs: number): Promise<boolean>;
  touch(binding: SessionBinding, sessionIdHash: string, idleTtlMs: number): Promise<StoredSession | undefined>;
  acquireRefreshLock(binding: SessionBinding, sessionIdHash: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseRefreshLock(binding: SessionBinding, sessionIdHash: string, owner: string): Promise<void>;
  replaceAfterRefresh(binding: SessionBinding, sessionIdHash: string, expectedGeneration: number, session: StoredSession): Promise<boolean>;
}

export class SessionStoreUnavailableError extends Error {
  constructor(options?: ErrorOptions) { super("Authenticated session storage is unavailable", options); this.name = "SessionStoreUnavailableError"; }
}

const CREATE = `if redis.call('EXISTS',KEYS[1])==1 then return 0 end redis.call('SET',KEYS[1],ARGV[1],'PXAT',ARGV[2]); redis.call('SADD',KEYS[2],KEYS[1]); redis.call('PEXPIREAT',KEYS[2],ARGV[2]); redis.call('SADD',KEYS[3],KEYS[1]); redis.call('PEXPIREAT',KEYS[3],ARGV[2]); return 1`;
const ROTATE = `if KEYS[1]~=KEYS[2] then redis.call('DEL',KEYS[1]); redis.call('SREM',KEYS[3],KEYS[1]); redis.call('SREM',KEYS[4],KEYS[1]) end redis.call('SET',KEYS[2],ARGV[1],'PXAT',ARGV[2]); redis.call('SADD',KEYS[3],KEYS[2]); redis.call('PEXPIREAT',KEYS[3],ARGV[2]); redis.call('SADD',KEYS[4],KEYS[2]); redis.call('PEXPIREAT',KEYS[4],ARGV[2]); return 1`;
const REVOKE = `local value=redis.call('GET',KEYS[1]); if not value then return 0 end; redis.call('DEL',KEYS[1]); redis.call('SREM',KEYS[2],KEYS[1]); redis.call('SREM',KEYS[3],KEYS[1]); return 1`;
const REVOKE_INDEX = `local members=redis.call('SMEMBERS',KEYS[1]); for _,key in ipairs(members) do redis.call('DEL',key) end; redis.call('DEL',KEYS[1]); return #members`;
const CONSUME = `local value=redis.call('GET',KEYS[1]); if value then redis.call('DEL',KEYS[1]) end; return value`;
const TOUCH = `local raw=redis.call('GET',KEYS[1]); if not raw then return false end; local s=cjson.decode(raw); local now=tonumber(ARGV[1]); if now-s.lastSeenAt<tonumber(ARGV[2]) then return raw end; s.lastSeenAt=now; s.idleExpiresAt=math.min(now+tonumber(ARGV[3]),s.absoluteExpiresAt); local updated=cjson.encode(s); redis.call('SET',KEYS[1],updated,'PXAT',s.idleExpiresAt); redis.call('PEXPIREAT',KEYS[2],s.idleExpiresAt); redis.call('PEXPIREAT',KEYS[3],s.idleExpiresAt); return updated`;
const RELEASE_LOCK = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0`;
const REPLACE_REFRESH = `local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local s=cjson.decode(raw); if s.refreshGeneration~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'PXAT',ARGV[3]); return 1`;

export function hashOpaqueSessionId(value: string): string { return createHash("sha256").update(value, "utf8").digest("base64url"); }
export function createRedisClient(redisUrl: string): Redis {
  if (!/^rediss?:\/\//.test(redisUrl)) throw new TypeError("A redis:// or rediss:// URL is required");
  return new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
}

export function createRedisSessionStore(options: RedisSessionStoreOptions): SessionStore {
  const prefix = options.namespace ?? "athyper:session"; const version = options.keyVersion ?? 1; const now = options.now ?? Date.now; const touchInterval = options.touchIntervalMs ?? 60_000;
  const base = (binding: SessionBinding) => `${prefix}:v${version}:${safe(binding.plane)}:${safe(binding.realmKey)}`;
  const sessionKey = (binding: SessionBinding, id: string) => `${base(binding)}:session:${safe(id)}`;
  const principalKey = (binding: SessionBinding, id: string) => `${base(binding)}:principal:${digest(id)}`;
  const providerKey = (binding: SessionBinding, id: string) => `${base(binding)}:provider:${digest(id)}`;
  const stateKey = (binding: SessionBinding, id: string) => `${base(binding)}:state:${safe(id)}`;
  const logoutTokenKey = (binding: SessionBinding, id: string) => `${base(binding)}:logout-token:${safe(id)}`;
  const lockKey = (binding: SessionBinding, id: string) => `${base(binding)}:refresh:${safe(id)}`;
  const call = async <T>(operation: string, action: () => Promise<T>, isMiss?: (value: T) => boolean): Promise<T> => { const started = now(); try { if (options.redis.status === "wait") await options.redis.connect?.(); const value = await action(); options.observe?.({ operation, outcome: isMiss?.(value) ? "miss" : "ok", durationMs: now() - started }); return value; } catch (cause) { options.observe?.({ operation, outcome: "unavailable", durationMs: now() - started }); throw new SessionStoreUnavailableError({ cause }); } };
  const indexes = (binding: SessionBinding, session: StoredSession) => [principalKey(binding, session.principalId), providerKey(binding, session.providerSessionId)] as const;
  return {
    health: () => call("health", async () => { await options.redis.ping(); }),
    create: (id, session) => call("create", async () => { validateStoredSession(session); const [principal, provider] = indexes(session, session); const result = await options.redis.eval(CREATE, 3, sessionKey(session, id), principal, provider, JSON.stringify(session), session.idleExpiresAt); if (Number(result) !== 1) throw new Error("Session identifier collision"); }),
    read: (binding, id) => call("read", async () => parseStoredSession(await options.redis.get(sessionKey(binding, id)), now()), (value) => value === undefined),
    rotate: (binding, oldId, newId, session) => call("rotate", async () => { validateStoredSession(session); const [principal, provider] = indexes(binding, session); await options.redis.eval(ROTATE, 4, sessionKey(binding, oldId ?? newId), sessionKey(binding, newId), principal, provider, JSON.stringify(session), session.idleExpiresAt); }),
    revoke: (binding, id) => call("revoke", async () => { const existing = parseStoredSession(await options.redis.get(sessionKey(binding, id)), now(), false); if (!existing) return false; const [principal, provider] = indexes(binding, existing); return Number(await options.redis.eval(REVOKE, 3, sessionKey(binding, id), principal, provider)) === 1; }),
    revokePrincipal: (binding, id) => call("revoke-principal", async () => Number(await options.redis.eval(REVOKE_INDEX, 1, principalKey(binding, id)))),
    revokeProviderSession: (binding, id) => call("revoke-provider", async () => Number(await options.redis.eval(REVOKE_INDEX, 1, providerKey(binding, id)))),
    putOneTimeState: (binding, id, value, ttl) => call("put-state", async () => { if (await options.redis.set(stateKey(binding, id), value, "PX", ttl, "NX") !== "OK") throw new Error("OAuth state collision"); }),
    consumeOneTimeState: (binding, id) => call("consume-state", async () => { const value = await options.redis.eval(CONSUME, 1, stateKey(binding, id)); return typeof value === "string" ? value : undefined; }, (value) => value === undefined),
    claimLogoutToken: (binding, id, ttl) => call("claim-logout-token", async () => (await options.redis.set(logoutTokenKey(binding, id), "1", "PX", ttl, "NX")) === "OK", (value) => value === false),
    touch: (binding, id, ttl) => call("touch", async () => { const current = parseStoredSession(await options.redis.get(sessionKey(binding, id)), now()); if (!current) return undefined; const [principal, provider] = indexes(binding, current); const result = await options.redis.eval(TOUCH, 3, sessionKey(binding, id), principal, provider, now(), touchInterval, ttl); return parseStoredSession(typeof result === "string" ? result : null, now()); }, (value) => value === undefined),
    acquireRefreshLock: (binding, id, owner, ttl) => call("refresh-lock", async () => (await options.redis.set(lockKey(binding, id), owner, "PX", ttl, "NX")) === "OK"),
    releaseRefreshLock: (binding, id, owner) => call("refresh-unlock", async () => { await options.redis.eval(RELEASE_LOCK, 1, lockKey(binding, id), owner); }),
    replaceAfterRefresh: (binding, id, generation, session) => call("refresh-replace", async () => Number(await options.redis.eval(REPLACE_REFRESH, 1, sessionKey(binding, id), generation, JSON.stringify(session), session.idleExpiresAt)) === 1),
  };
}

function validateStoredSession(session: StoredSession): void { if (session.schemaVersion !== 1 || !session.realmKey || !session.principalId || !session.providerSessionId) throw new TypeError("Stored session identity is incomplete"); if (!!session.encryptedTokenBundle === !!session.opaqueTokenReference) throw new TypeError("Exactly one server token representation is required"); if (session.idleExpiresAt > session.absoluteExpiresAt || session.lastSeenAt < session.createdAt) throw new TypeError("Stored session expiry is invalid"); }
function parseStoredSession(raw: string | null, currentTime: number, enforceExpiry = true): StoredSession | undefined { if (!raw) return undefined; const value = JSON.parse(raw) as StoredSession; validateStoredSession(value); if (enforceExpiry && (value.idleExpiresAt <= currentTime || value.absoluteExpiresAt <= currentTime)) return undefined; return Object.freeze(value); }
function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function safe(value: string): string { if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new TypeError("Unsafe Redis key component"); return value; }
