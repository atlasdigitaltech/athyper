// Session store test — exercises RedisSessionStore with an in-memory
// Map-based mock cache that mimics the CacheClient interface.

import { RedisSessionStore, hashValue, type SessionCreateInput } from "../session-store.js";

// ─── Mock Cache ─────────────────────────────────────────────────

function createMockCache() {
    const store = new Map<string, string>();
    const sets = new Map<string, Set<string>>();
    return {
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string, _opts?: { EX?: number }) => {
            store.set(key, value);
        },
        del: async (key: string) => {
            store.delete(key);
        },
        sadd: async (key: string, ...members: string[]) => {
            if (!sets.has(key)) sets.set(key, new Set());
            for (const m of members) sets.get(key)!.add(m);
        },
        srem: async (key: string, ...members: string[]) => {
            for (const m of members) sets.get(key)?.delete(m);
        },
        smembers: async (key: string) => [...(sets.get(key) ?? [])],
        _store: store,
        _sets: sets,
    };
}

// ─── Helpers ────────────────────────────────────────────────────

function sampleInput(overrides?: Partial<SessionCreateInput>): SessionCreateInput {
    return {
        tenantId: "tenant-alpha",
        userId: "user-1",
        principalId: "principal-1",
        realmKey: "main",
        workbench: "admin",
        roles: ["admin"],
        groups: ["platform-admins"],
        persona: "platform_admin",
        accessToken: "access-token-xxx",
        refreshToken: "refresh-token-xxx",
        accessExpiresAt: Math.floor(Date.now() / 1000) + 3600,
        refreshExpiresAt: Math.floor(Date.now() / 1000) + 7200,
        ipHash: hashValue("127.0.0.1"),
        uaHash: hashValue("Mozilla/5.0"),
        csrfToken: "csrf-token-xxx",
        ...overrides,
    };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("RedisSessionStore", () => {
    // ── create ──────────────────────────────────────────────────

    it("create() returns a sid and stores session in Redis", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid = await store.create("tenant-alpha", sampleInput());

        expect(sid).toBeDefined();
        expect(typeof sid).toBe("string");
        expect(sid.length).toBe(64); // 32 random bytes as hex

        // Verify the data landed in the mock store
        const key = `sess:tenant-alpha:${sid}`;
        expect(cache._store.has(key)).toBe(true);

        const stored = JSON.parse(cache._store.get(key)!);
        expect(stored.version).toBe(1);
        expect(stored.sid).toBe(sid);
        expect(stored.tenantId).toBe("tenant-alpha");
        expect(stored.userId).toBe("user-1");
        expect(stored.createdAt).toEqual(expect.any(Number));
        expect(stored.lastSeenAt).toEqual(expect.any(Number));
    });

    it("create() adds sid to user session index", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid = await store.create("tenant-alpha", sampleInput());

        const indexKey = "user_sessions:tenant-alpha:user-1";
        const members = cache._sets.get(indexKey);
        expect(members).toBeDefined();
        expect(members!.has(sid)).toBe(true);
    });

    // ── load ────────────────────────────────────────────────────

    it("load() returns stored session", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid = await store.create("tenant-alpha", sampleInput());
        const session = await store.load("tenant-alpha", sid);

        expect(session).not.toBeNull();
        expect(session!.sid).toBe(sid);
        expect(session!.tenantId).toBe("tenant-alpha");
        expect(session!.userId).toBe("user-1");
        expect(session!.roles).toEqual(["admin"]);
    });

    it("load() returns null for nonexistent session", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const session = await store.load("tenant-alpha", "nonexistent-sid");

        expect(session).toBeNull();
    });

    it("load() detects cross-tenant anomaly and deletes session", async () => {
        const anomalyCallback = vi.fn();
        const cache = createMockCache();
        const store = new RedisSessionStore(cache, {
            onCrossTenantAnomaly: anomalyCallback,
        });

        // Create session for tenant-alpha
        const sid = await store.create("tenant-alpha", sampleInput());

        // Manually rewrite the cache key so it's accessible under tenant-beta
        // (simulating a scenario where a sid is presented with the wrong tenant)
        const originalKey = `sess:tenant-alpha:${sid}`;
        const crossTenantKey = `sess:tenant-beta:${sid}`;
        const rawSession = cache._store.get(originalKey)!;
        cache._store.set(crossTenantKey, rawSession);

        // Load with tenant-beta — the stored session says tenant-alpha
        const result = await store.load("tenant-beta", sid);

        expect(result).toBeNull();
        expect(anomalyCallback).toHaveBeenCalledOnce();
        expect(anomalyCallback).toHaveBeenCalledWith(
            expect.objectContaining({
                expectedTenant: "tenant-beta",
                actualTenant: "tenant-alpha",
            }),
        );

        // The cross-tenant key should have been deleted
        expect(cache._store.has(crossTenantKey)).toBe(false);
    });

    // ── destroy ─────────────────────────────────────────────────

    it("destroy() removes session and user index", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid = await store.create("tenant-alpha", sampleInput());

        await store.destroy("tenant-alpha", sid);

        // Session key should be gone
        const key = `sess:tenant-alpha:${sid}`;
        expect(cache._store.has(key)).toBe(false);

        // User session index should no longer contain this sid
        const indexKey = "user_sessions:tenant-alpha:user-1";
        const members = cache._sets.get(indexKey);
        expect(members?.has(sid) ?? false).toBe(false);
    });

    // ── destroyAllForUser ───────────────────────────────────────

    it("destroyAllForUser() removes all user sessions", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid1 = await store.create("tenant-alpha", sampleInput());
        const sid2 = await store.create("tenant-alpha", sampleInput());

        const count = await store.destroyAllForUser("tenant-alpha", "user-1");

        expect(count).toBe(2);

        // Both sessions should be gone
        expect(await store.load("tenant-alpha", sid1)).toBeNull();
        expect(await store.load("tenant-alpha", sid2)).toBeNull();

        // The index key itself should be deleted
        const indexKey = "user_sessions:tenant-alpha:user-1";
        expect(cache._store.has(indexKey)).toBe(false);
    });

    // ── touch ───────────────────────────────────────────────────

    it("touch() updates lastSeenAt", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid = await store.create("tenant-alpha", sampleInput());
        const before = (await store.load("tenant-alpha", sid))!.lastSeenAt;

        // Advance time slightly (since we use Math.floor(Date.now()/1000), we
        // mock Date.now to guarantee a different second)
        const originalNow = Date.now;
        vi.spyOn(Date, "now").mockReturnValue(originalNow() + 5000);

        await store.touch("tenant-alpha", sid);

        vi.spyOn(Date, "now").mockRestore();

        const after = (await store.load("tenant-alpha", sid))!.lastSeenAt;

        expect(after).toBeGreaterThanOrEqual(before);
    });

    // ── rotateSid ───────────────────────────────────────────────

    it("rotateSid() creates new key and deletes old", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const oldSid = await store.create("tenant-alpha", sampleInput());
        const newSid = await store.rotateSid("tenant-alpha", oldSid);

        expect(newSid).not.toBeNull();
        expect(newSid).not.toBe(oldSid);
        expect(typeof newSid).toBe("string");
        expect(newSid!.length).toBe(64);

        // New sid should be loadable
        const session = await store.load("tenant-alpha", newSid!);
        expect(session).not.toBeNull();
        expect(session!.sid).toBe(newSid);
        expect(session!.userId).toBe("user-1");

        // Old sid should be gone
        const oldSession = await store.load("tenant-alpha", oldSid);
        expect(oldSession).toBeNull();
    });

    it("rotateSid() returns null for nonexistent session", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const result = await store.rotateSid("tenant-alpha", "nonexistent-sid");

        expect(result).toBeNull();
    });

    it("rotateSid() updates user session index", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const oldSid = await store.create("tenant-alpha", sampleInput());
        const newSid = await store.rotateSid("tenant-alpha", oldSid);

        const indexKey = "user_sessions:tenant-alpha:user-1";
        const members = cache._sets.get(indexKey)!;

        expect(members.has(oldSid)).toBe(false);
        expect(members.has(newSid!)).toBe(true);
    });

    // ── hashValue ───────────────────────────────────────────────

    it("hashValue() produces consistent SHA-256", () => {
        const h1 = hashValue("test-input");
        const h2 = hashValue("test-input");

        expect(h1).toBe(h2);
        expect(h1.length).toBe(64); // SHA-256 produces 64 hex chars
    });

    it("hashValue() produces different output for different input", () => {
        const h1 = hashValue("input-a");
        const h2 = hashValue("input-b");

        expect(h1).not.toBe(h2);
    });
});
