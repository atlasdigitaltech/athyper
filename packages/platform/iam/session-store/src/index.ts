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
  /** Immutable upstream subject used to bind step-up callbacks to the login identity. */
  readonly providerSubject?: string;
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
  /** Database authority epoch resolved with this exact tenant projection. */
  readonly authEpoch?: number;
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
export interface RedisSessionStoreOptions {
  readonly redis: RedisLike;
  readonly namespace?: string;
  /** Version of the Redis key namespace. Rotate independently from token-encryption keys. */
  readonly namespaceVersion?: number;
  /** @deprecated Use namespaceVersion. */
  readonly keyVersion?: number;
  readonly touchIntervalMs?: number;
  readonly now?: () => number;
  readonly observe?: (metric: SessionStoreMetric) => void;
}
export interface SessionStore {
  health(): Promise<void>;
  create(sessionIdHash: string, session: StoredSession): Promise<void>;
  read(binding: SessionBinding, sessionIdHash: string): Promise<StoredSession | undefined>;
  /** Rotate an existing session only if its predecessor is still live and unchanged. */
  rotate(binding: SessionBinding, oldHash: string, newHash: string, session: StoredSession, expectedSessionVersion: number): Promise<boolean>;
  revoke(binding: SessionBinding, sessionIdHash: string): Promise<boolean>;
  revokePrincipal(binding: SessionBinding, principalId: string): Promise<number>;
  revokeProviderSession(binding: SessionBinding, providerSessionId: string): Promise<number>;
  putOneTimeState(binding: SessionBinding, stateHash: string, value: string, ttlMs: number): Promise<void>;
  consumeOneTimeState(binding: SessionBinding, stateHash: string): Promise<string | undefined>;
  /** Revoke provider sessions and record successful delivery in one atomic operation. */
  completeBackchannelLogout(binding: SessionBinding, providerSessionId: string, tokenHash: string, ttlMs: number): Promise<{ readonly replayed: boolean; readonly revokedSessions: number }>;
  touch(binding: SessionBinding, sessionIdHash: string, idleTtlMs: number): Promise<StoredSession | undefined>;
  acquireRefreshLock(binding: SessionBinding, sessionIdHash: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseRefreshLock(binding: SessionBinding, sessionIdHash: string, owner: string): Promise<void>;
  replaceAfterRefresh(binding: SessionBinding, sessionIdHash: string, expectedGeneration: number, session: StoredSession): Promise<boolean>;
}

export class SessionStoreUnavailableError extends Error {
  constructor(options?: ErrorOptions) { super("Authenticated session storage is unavailable", options); this.name = "SessionStoreUnavailableError"; }
}

const CREATE = `if redis.call('EXISTS',KEYS[1])==1 then return 0 end redis.call('SET',KEYS[1],ARGV[1],'PXAT',ARGV[2]); redis.call('SADD',KEYS[2],KEYS[1]); redis.call('PEXPIREAT',KEYS[2],ARGV[2],'NX'); redis.call('PEXPIREAT',KEYS[2],ARGV[2],'GT'); redis.call('SADD',KEYS[3],KEYS[1]); redis.call('PEXPIREAT',KEYS[3],ARGV[2],'NX'); redis.call('PEXPIREAT',KEYS[3],ARGV[2],'GT'); return 1`;
const ROTATE = `
local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end
if redis.call('SCARD',KEYS[7])>0 then return 0 end
local previous=cjson.decode(raw)
local now=tonumber(ARGV[4])
if previous.sessionVersion~=tonumber(ARGV[3]) or previous.idleExpiresAt<=now or previous.absoluteExpiresAt<=now then return 0 end
if redis.call('EXISTS',KEYS[2])==1 then return 0 end
redis.call('DEL',KEYS[1])
redis.call('SREM',KEYS[5],KEYS[1]); redis.call('SREM',KEYS[6],KEYS[1])
redis.call('SET',KEYS[2],ARGV[1],'PXAT',ARGV[2])
redis.call('SADD',KEYS[3],KEYS[2]); redis.call('PEXPIREAT',KEYS[3],ARGV[2],'NX'); redis.call('PEXPIREAT',KEYS[3],ARGV[2],'GT')
redis.call('SADD',KEYS[4],KEYS[2]); redis.call('PEXPIREAT',KEYS[4],ARGV[2],'NX'); redis.call('PEXPIREAT',KEYS[4],ARGV[2],'GT')
return 1`;
const REVOKE = `local value=redis.call('GET',KEYS[1]); if not value then return 0 end; redis.call('DEL',KEYS[1]); redis.call('SREM',KEYS[2],KEYS[1]); redis.call('SREM',KEYS[3],KEYS[1]); return 1`;
const REVOKE_INDEX = `local members=redis.call('SMEMBERS',KEYS[1]); for _,key in ipairs(members) do redis.call('DEL',key) end; redis.call('DEL',KEYS[1]); return #members`;
// Legacy "1" markers only claimed a delivery; they do not prove revocation.
// Write the completion marker last so a script error cannot acknowledge unfinished work.
const COMPLETE_BACKCHANNEL_LOGOUT = `
if redis.call('GET',KEYS[2])=='completed' then return -1 end
local members=redis.call('SMEMBERS',KEYS[1])
local revoked=0
for _,key in ipairs(members) do revoked=revoked+redis.call('DEL',key) end
redis.call('DEL',KEYS[1])
redis.call('SET',KEYS[2],'completed','PX',ARGV[1])
return revoked`;
const CONSUME = `local value=redis.call('GET',KEYS[1]); if value then redis.call('DEL',KEYS[1]) end; return value`;
// Do not cjson.encode the decoded session here. Redis Lua loses the array
// identity of an empty JSON array and serializes requiredActions: [] as {},
// corrupting the public session contract on the first idle touch. The caller
// supplies canonical JSON; the script applies it only while the version still
// matches the record it read.
const TOUCH = `local raw=redis.call('GET',KEYS[1]); if not raw then return false end; local s=cjson.decode(raw); local now=tonumber(ARGV[1]); if now-s.lastSeenAt<tonumber(ARGV[2]) then return raw end; if s.sessionVersion~=tonumber(ARGV[4]) then return raw end; local updated=ARGV[5]; local idleExpiresAt=tonumber(ARGV[6]); redis.call('SET',KEYS[1],updated,'PXAT',idleExpiresAt); redis.call('PEXPIREAT',KEYS[2],idleExpiresAt,'NX'); redis.call('PEXPIREAT',KEYS[2],idleExpiresAt,'GT'); redis.call('PEXPIREAT',KEYS[3],idleExpiresAt,'NX'); redis.call('PEXPIREAT',KEYS[3],idleExpiresAt,'GT'); return updated`;
// Track every outstanding refresh independently of the short coalescing lease.
// A slow request must continue to block rotation after its lease expires. A
// crashed worker leaves a conservative guard until the session's absolute expiry;
// a fresh login can always replace that session.
const ACQUIRE_REFRESH = `
if redis.call('EXISTS',KEYS[1])==1 then return 0 end
local raw=redis.call('GET',KEYS[2]); if not raw then return 0 end
local session=cjson.decode(raw)
if session.idleExpiresAt<=tonumber(ARGV[3]) or session.absoluteExpiresAt<=tonumber(ARGV[3]) then return 0 end
redis.call('SADD',KEYS[3],ARGV[1])
redis.call('PEXPIREAT',KEYS[3],session.absoluteExpiresAt)
redis.call('SET',KEYS[1],ARGV[1],'PX',ARGV[2])
return 1`;
const RELEASE_LOCK = `redis.call('SREM',KEYS[2],ARGV[1]); if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0`;
// Compare the exact JSON snapshot before committing the merged refresh fields.
// Merging in TypeScript preserves empty arrays, which Redis cjson re-encodes as objects.
const REPLACE_REFRESH = `local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; if raw~=ARGV[1] then return -1 end; redis.call('SET',KEYS[1],ARGV[2],'PXAT',ARGV[3]); return 1`;

export function hashOpaqueSessionId(value: string): string { return createHash("sha256").update(value, "utf8").digest("base64url"); }
export function createRedisClient(redisUrl: string): Redis {
  if (!/^rediss?:\/\//.test(redisUrl)) throw new TypeError("A redis:// or rediss:// URL is required");
  return new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
}

export function createRedisSessionStore(options: RedisSessionStoreOptions): SessionStore {
  const prefix = options.namespace ?? "athyper:session"; const version = options.namespaceVersion ?? options.keyVersion ?? 1; const now = options.now ?? Date.now; const touchInterval = options.touchIntervalMs ?? 60_000;
  const base = (binding: SessionBinding) => `${prefix}:v${version}:${safe(binding.plane)}:${safe(binding.realmKey)}`;
  const sessionKey = (binding: SessionBinding, id: string) => `${base(binding)}:session:${safe(id)}`;
  const principalKey = (binding: SessionBinding, id: string) => `${base(binding)}:principal:${digest(id)}`;
  const providerKey = (binding: SessionBinding, id: string) => `${base(binding)}:provider:${digest(id)}`;
  const stateKey = (binding: SessionBinding, id: string) => `${base(binding)}:state:${safe(id)}`;
  const logoutTokenKey = (binding: SessionBinding, id: string) => `${base(binding)}:logout-token:${safe(id)}`;
  const lockKey = (binding: SessionBinding, id: string) => `${base(binding)}:refresh:${safe(id)}`;
  const pendingRefreshKey = (binding: SessionBinding, id: string) => `${base(binding)}:refresh-pending:${safe(id)}`;
  const call = async <T>(operation: string, action: () => Promise<T>, isMiss?: (value: T) => boolean): Promise<T> => { const started = now(); try { if (options.redis.status === "wait") await options.redis.connect?.(); const value = await action(); options.observe?.({ operation, outcome: isMiss?.(value) ? "miss" : "ok", durationMs: now() - started }); return value; } catch (cause) { options.observe?.({ operation, outcome: "unavailable", durationMs: now() - started }); throw new SessionStoreUnavailableError({ cause }); } };
  const indexes = (binding: SessionBinding, session: StoredSession) => [principalKey(binding, session.principalId), providerKey(binding, session.providerSessionId)] as const;
  return {
    health: () => call("health", async () => { await options.redis.ping(); }),
    create: (id, session) => call("create", async () => { validateStoredSession(session); const [principal, provider] = indexes(session, session); const result = await options.redis.eval(CREATE, 3, sessionKey(session, id), principal, provider, JSON.stringify(session), session.idleExpiresAt); if (Number(result) !== 1) throw new Error("Session identifier collision"); }),
    read: (binding, id) => call("read", async () => parseStoredSession(await options.redis.get(sessionKey(binding, id)), now()), (value) => value === undefined),
    rotate: (binding, oldId, newId, session, expectedSessionVersion) => call("rotate", async () => {
      validateStoredSession(session);
      const previous = parseStoredSession(await options.redis.get(sessionKey(binding, oldId)), now());
      if (!previous || previous.sessionVersion !== expectedSessionVersion) return false;
      const [principal, provider] = indexes(binding, session);
      const [oldPrincipal, oldProvider] = indexes(binding, previous);
      return Number(await options.redis.eval(ROTATE, 7, sessionKey(binding, oldId), sessionKey(binding, newId), principal, provider, oldPrincipal, oldProvider, pendingRefreshKey(binding, oldId), JSON.stringify(session), session.idleExpiresAt, expectedSessionVersion, now())) === 1;
    }, (value) => value === false),
    revoke: (binding, id) => call("revoke", async () => { const existing = parseStoredSession(await options.redis.get(sessionKey(binding, id)), now(), false); if (!existing) return false; const [principal, provider] = indexes(binding, existing); return Number(await options.redis.eval(REVOKE, 3, sessionKey(binding, id), principal, provider)) === 1; }),
    revokePrincipal: (binding, id) => call("revoke-principal", async () => Number(await options.redis.eval(REVOKE_INDEX, 1, principalKey(binding, id)))),
    revokeProviderSession: (binding, id) => call("revoke-provider", async () => Number(await options.redis.eval(REVOKE_INDEX, 1, providerKey(binding, id)))),
    putOneTimeState: (binding, id, value, ttl) => call("put-state", async () => { if (await options.redis.set(stateKey(binding, id), value, "PX", ttl, "NX") !== "OK") throw new Error("OAuth state collision"); }),
    consumeOneTimeState: (binding, id) => call("consume-state", async () => { const value = await options.redis.eval(CONSUME, 1, stateKey(binding, id)); return typeof value === "string" ? value : undefined; }, (value) => value === undefined),
    completeBackchannelLogout: (binding, providerId, tokenId, ttl) => call("complete-backchannel-logout", async () => {
      if (!Number.isSafeInteger(ttl) || ttl < 1) throw new TypeError("Logout completion TTL must be a positive integer");
      const result = Number(await options.redis.eval(COMPLETE_BACKCHANNEL_LOGOUT, 2, providerKey(binding, providerId), logoutTokenKey(binding, tokenId), ttl));
      return { replayed: result === -1, revokedSessions: Math.max(0, result) };
    }, (value) => value.replayed),
    touch: (binding, id, ttl) => call("touch", async () => { const currentTime = now(); const current = parseStoredSession(await options.redis.get(sessionKey(binding, id)), currentTime); if (!current) return undefined; const [principal, provider] = indexes(binding, current); const touched = Object.freeze({ ...current, lastSeenAt: currentTime, idleExpiresAt: Math.min(currentTime + ttl, current.absoluteExpiresAt) }); const result = await options.redis.eval(TOUCH, 3, sessionKey(binding, id), principal, provider, currentTime, touchInterval, ttl, current.sessionVersion, JSON.stringify(touched), touched.idleExpiresAt); return parseStoredSession(typeof result === "string" ? result : null, now()); }, (value) => value === undefined),
    acquireRefreshLock: (binding, id, owner, ttl) => call("refresh-lock", async () => Number(await options.redis.eval(ACQUIRE_REFRESH, 3, lockKey(binding, id), sessionKey(binding, id), pendingRefreshKey(binding, id), owner, ttl, now())) === 1),
    releaseRefreshLock: (binding, id, owner) => call("refresh-unlock", async () => { await options.redis.eval(RELEASE_LOCK, 2, lockKey(binding, id), pendingRefreshKey(binding, id), owner); }),
    replaceAfterRefresh: (binding, id, generation, session) => call("refresh-replace", async () => {
      const key = sessionKey(binding, id);
      for (;;) {
        const raw = await options.redis.get(key);
        const current = parseStoredSession(raw, now());
        if (!current || current.refreshGeneration !== generation) return false;
        const updated: StoredSession = {
          ...current,
          encryptedTokenBundle: session.encryptedTokenBundle,
          opaqueTokenReference: session.opaqueTokenReference,
          accessTokenExpiresAt: session.accessTokenExpiresAt,
          refreshGeneration: generation + 1,
          lastRefreshAt: session.lastRefreshAt,
          sessionVersion: current.sessionVersion + 1,
        };
        validateStoredSession(updated);
        const result = Number(await options.redis.eval(REPLACE_REFRESH, 1, key, raw!, JSON.stringify(updated), current.idleExpiresAt));
        if (result !== -1) return result === 1;
        // A touch or another writer won the race. Merge again against its state.
      }
    }),
  };
}

function validateStoredSession(session: StoredSession): void { if (session.schemaVersion !== 1 || !session.realmKey || !session.principalId || !session.providerSessionId) throw new TypeError("Stored session identity is incomplete"); if (!Array.isArray(session.requiredActions)) throw new TypeError("Stored session requiredActions must be an array"); if (!!session.encryptedTokenBundle === !!session.opaqueTokenReference) throw new TypeError("Exactly one server token representation is required"); if (session.idleExpiresAt > session.absoluteExpiresAt || session.lastSeenAt < session.createdAt) throw new TypeError("Stored session expiry is invalid"); }
function parseStoredSession(raw: string | null, currentTime: number, enforceExpiry = true): StoredSession | undefined { if (!raw) return undefined; const decoded = JSON.parse(raw) as StoredSession & { readonly requiredActions?: unknown }; const legacyEmptyObject = decoded.requiredActions !== null && typeof decoded.requiredActions === "object" && !Array.isArray(decoded.requiredActions) && Object.keys(decoded.requiredActions).length === 0; const value = (decoded.requiredActions == null || legacyEmptyObject ? { ...decoded, requiredActions: [] } : decoded) as StoredSession; validateStoredSession(value); if (enforceExpiry && (value.idleExpiresAt <= currentTime || value.absoluteExpiresAt <= currentTime)) return undefined; return Object.freeze(value); }
function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function safe(value: string): string { if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new TypeError("Unsafe Redis key component"); return value; }
