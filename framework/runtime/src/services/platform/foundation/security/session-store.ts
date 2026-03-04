// framework/runtime/src/services/platform/foundation/security/session-store.ts
//
// Redis-backed session store with tenant isolation, sid rotation,
// and user-level mass revocation. Browser cookie holds ONLY the sid.

import { createHash, randomBytes } from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────

export interface StoredSession {
    version: 1;
    sid: string;
    tenantId: string;
    userId: string;
    principalId: string;
    realmKey: string;
    workbench: string;
    roles: string[];
    groups: string[];
    persona: string;
    accessToken: string;
    refreshToken?: string;
    accessExpiresAt: number;
    refreshExpiresAt?: number;
    idToken?: string;
    ipHash: string;
    uaHash: string;
    csrfToken: string;
    createdAt: number;
    lastSeenAt: number;
    authzVersion?: number;
}

export type SessionCreateInput = Omit<StoredSession, "version" | "sid" | "createdAt" | "lastSeenAt">;

export interface SessionStoreOptions {
    /** Session TTL in seconds (default 28800 = 8 hours). */
    sessionTtlSeconds?: number;
    /** Callback for audit/telemetry on cross-tenant anomaly. */
    onCrossTenantAnomaly?: (details: { sid: string; expectedTenant: string; actualTenant: string }) => void;
}

// ─── Cache Adapter Interface ─────────────────────────────────────

interface CacheClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
    del(key: string): Promise<unknown>;
    // SET operations
    sadd?(key: string, ...members: string[]): Promise<unknown>;
    srem?(key: string, ...members: string[]): Promise<unknown>;
    smembers?(key: string): Promise<string[]>;
}

// ─── Helpers ─────────────────────────────────────────────────────

function generateSid(): string {
    return randomBytes(32).toString("hex");
}

export function hashValue(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function sessionKey(tenantId: string, sid: string): string {
    return `sess:${tenantId}:${sid}`;
}

function userSessionsKey(tenantId: string, userId: string): string {
    return `user_sessions:${tenantId}:${userId}`;
}

// ─── RedisSessionStore ───────────────────────────────────────────

export class RedisSessionStore {
    private readonly cache: CacheClient;
    private readonly ttl: number;
    private readonly onCrossTenantAnomaly?: SessionStoreOptions["onCrossTenantAnomaly"];

    constructor(cache: CacheClient, options?: SessionStoreOptions) {
        this.cache = cache;
        this.ttl = options?.sessionTtlSeconds ?? 28800;
        this.onCrossTenantAnomaly = options?.onCrossTenantAnomaly;
    }

    /**
     * Create a new session. Returns the generated sid.
     */
    async create(tenantId: string, data: SessionCreateInput): Promise<string> {
        const sid = generateSid();
        const now = Math.floor(Date.now() / 1000);

        const session: StoredSession = {
            ...data,
            version: 1,
            sid,
            tenantId,
            createdAt: now,
            lastSeenAt: now,
        };

        const key = sessionKey(tenantId, sid);
        await this.cache.set(key, JSON.stringify(session), { EX: this.ttl });

        // Add to user session index
        if (this.cache.sadd) {
            await this.cache.sadd(userSessionsKey(tenantId, data.userId), sid);
        }

        return sid;
    }

    /**
     * Load a session. Returns null if not found or tenant mismatch.
     * On cross-tenant mismatch: deletes session, calls anomaly handler.
     */
    async load(tenantId: string, sid: string): Promise<StoredSession | null> {
        const key = sessionKey(tenantId, sid);
        const raw = await this.cache.get(key);
        if (!raw) return null;

        let session: StoredSession;
        try {
            session = JSON.parse(raw);
        } catch {
            await this.cache.del(key);
            return null;
        }

        // Tenant isolation enforcement
        if (session.tenantId !== tenantId) {
            this.onCrossTenantAnomaly?.({
                sid: hashValue(sid),
                expectedTenant: tenantId,
                actualTenant: session.tenantId,
            });
            await this.cache.del(key);
            return null;
        }

        return session;
    }

    /**
     * Destroy a single session.
     */
    async destroy(tenantId: string, sid: string): Promise<void> {
        // Load first to get userId for index cleanup
        const session = await this.load(tenantId, sid);
        await this.cache.del(sessionKey(tenantId, sid));

        if (session && this.cache.srem) {
            await this.cache.srem(userSessionsKey(tenantId, session.userId), sid);
        }
    }

    /**
     * Destroy all sessions for a user. Returns count of sessions destroyed.
     */
    async destroyAllForUser(tenantId: string, userId: string): Promise<number> {
        const indexKey = userSessionsKey(tenantId, userId);
        let sids: string[] = [];

        if (this.cache.smembers) {
            sids = await this.cache.smembers(indexKey);
        }

        let count = 0;
        for (const sid of sids) {
            await this.cache.del(sessionKey(tenantId, sid));
            count++;
        }

        // Clean up the index itself
        if (sids.length > 0) {
            await this.cache.del(indexKey);
        }

        return count;
    }

    /**
     * Update lastSeenAt timestamp.
     */
    async touch(tenantId: string, sid: string): Promise<void> {
        const session = await this.load(tenantId, sid);
        if (!session) return;

        session.lastSeenAt = Math.floor(Date.now() / 1000);
        await this.cache.set(sessionKey(tenantId, sid), JSON.stringify(session), { EX: this.ttl });
    }

    /**
     * Rotate session ID. Creates a new key with same data, deletes old.
     * Returns new sid, or null if session not found.
     */
    async rotateSid(tenantId: string, oldSid: string): Promise<string | null> {
        const session = await this.load(tenantId, oldSid);
        if (!session) return null;

        const newSid = generateSid();
        session.sid = newSid;
        session.lastSeenAt = Math.floor(Date.now() / 1000);

        // Write new, delete old
        await this.cache.set(sessionKey(tenantId, newSid), JSON.stringify(session), { EX: this.ttl });
        await this.cache.del(sessionKey(tenantId, oldSid));

        // Update user session index
        if (this.cache.srem && this.cache.sadd) {
            await this.cache.srem(userSessionsKey(tenantId, session.userId), oldSid);
            await this.cache.sadd(userSessionsKey(tenantId, session.userId), newSid);
        }

        return newSid;
    }

    /**
     * Partial update of session fields.
     */
    async update(tenantId: string, sid: string, patch: Partial<StoredSession>): Promise<void> {
        const session = await this.load(tenantId, sid);
        if (!session) return;

        // Merge patch (don't allow overriding critical fields)
        const updated: StoredSession = {
            ...session,
            ...patch,
            version: 1, // immutable
            sid: session.sid, // immutable
            tenantId: session.tenantId, // immutable
            createdAt: session.createdAt, // immutable
        };

        await this.cache.set(sessionKey(tenantId, sid), JSON.stringify(updated), { EX: this.ttl });
    }
}
