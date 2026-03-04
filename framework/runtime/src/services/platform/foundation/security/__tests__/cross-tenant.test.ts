// Cross-tenant security tests — exercises tenant isolation in the session store,
// session fixation via sid rotation, and token replay prevention.

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

describe("Cross-tenant session isolation", () => {
    it("cannot load a tenant-alpha session under tenant-beta namespace", async () => {
        const anomalyCallback = vi.fn();
        const cache = createMockCache();
        const store = new RedisSessionStore(cache, {
            onCrossTenantAnomaly: anomalyCallback,
        });

        // Create session for tenant-alpha
        const sid = await store.create("tenant-alpha", sampleInput());

        // Attempt to load it with tenant-beta key (must fail)
        const result = await store.load("tenant-beta", sid);

        // Session must not be returned (different key namespace)
        expect(result).toBeNull();
    });

    it("fires anomaly callback when session tenantId mismatches namespace", async () => {
        const anomalyCallback = vi.fn();
        const cache = createMockCache();
        const store = new RedisSessionStore(cache, {
            onCrossTenantAnomaly: anomalyCallback,
        });

        const sid = await store.create("tenant-alpha", sampleInput());

        // Manually plant the session data under a different tenant's key space
        // (simulating a bug or injection where a sid leaks to the wrong namespace)
        const rawSession = cache._store.get(`sess:tenant-alpha:${sid}`)!;
        cache._store.set(`sess:tenant-beta:${sid}`, rawSession);

        const result = await store.load("tenant-beta", sid);

        expect(result).toBeNull();
        expect(anomalyCallback).toHaveBeenCalledWith(
            expect.objectContaining({
                expectedTenant: "tenant-beta",
                actualTenant: "tenant-alpha",
            }),
        );
    });

    it("deletes the misplaced session key on cross-tenant detection", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache, {
            onCrossTenantAnomaly: vi.fn(),
        });

        const sid = await store.create("tenant-alpha", sampleInput());

        // Plant under wrong namespace
        const rawSession = cache._store.get(`sess:tenant-alpha:${sid}`)!;
        cache._store.set(`sess:tenant-beta:${sid}`, rawSession);

        await store.load("tenant-beta", sid);

        // The misplaced key should be deleted
        expect(cache._store.has(`sess:tenant-beta:${sid}`)).toBe(false);

        // The original key should still exist
        expect(cache._store.has(`sess:tenant-alpha:${sid}`)).toBe(true);
    });

    it("tenant-alpha user cannot see tenant-beta user sessions in mass revocation", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        // Create sessions in two different tenants for same userId
        const sidAlpha = await store.create("tenant-alpha", sampleInput());
        const sidBeta = await store.create("tenant-beta", sampleInput({ tenantId: "tenant-beta" }));

        // Mass revoke for tenant-alpha should only affect tenant-alpha
        const count = await store.destroyAllForUser("tenant-alpha", "user-1");

        expect(count).toBeGreaterThanOrEqual(1);

        // Alpha session should be gone
        expect(await store.load("tenant-alpha", sidAlpha)).toBeNull();

        // Beta session should still exist
        const betaSession = await store.load("tenant-beta", sidBeta);
        expect(betaSession).not.toBeNull();
        expect(betaSession!.tenantId).toBe("tenant-beta");
    });
});

describe("Session fixation prevention", () => {
    it("rotateSid produces a different session ID", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const oldSid = await store.create("tenant-alpha", sampleInput());
        const newSid = await store.rotateSid("tenant-alpha", oldSid);

        expect(newSid).not.toBeNull();
        expect(newSid).not.toBe(oldSid);
    });

    it("old sid is invalid after rotation", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const oldSid = await store.create("tenant-alpha", sampleInput());
        await store.rotateSid("tenant-alpha", oldSid);

        // Attacker tries to use the old sid
        const session = await store.load("tenant-alpha", oldSid);
        expect(session).toBeNull();
    });

    it("new sid contains correct session data after rotation", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const input = sampleInput({ roles: ["custom-role"], persona: "operator" });
        const oldSid = await store.create("tenant-alpha", input);
        const newSid = await store.rotateSid("tenant-alpha", oldSid);

        const session = await store.load("tenant-alpha", newSid!);
        expect(session).not.toBeNull();
        expect(session!.sid).toBe(newSid);
        expect(session!.roles).toEqual(["custom-role"]);
        expect(session!.persona).toBe("operator");
        expect(session!.tenantId).toBe("tenant-alpha");
    });

    it("user session index is updated after rotation", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const oldSid = await store.create("tenant-alpha", sampleInput());
        const newSid = await store.rotateSid("tenant-alpha", oldSid);

        const indexKey = "user_sessions:tenant-alpha:user-1";
        const members = cache._sets.get(indexKey)!;

        expect(members.has(oldSid)).toBe(false);
        expect(members.has(newSid!)).toBe(true);
    });

    it("multiple rapid rotations all invalidate previous sids", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid1 = await store.create("tenant-alpha", sampleInput());
        const sid2 = await store.rotateSid("tenant-alpha", sid1);
        const sid3 = await store.rotateSid("tenant-alpha", sid2!);
        const sid4 = await store.rotateSid("tenant-alpha", sid3!);

        // Only the latest sid should be valid
        expect(await store.load("tenant-alpha", sid1)).toBeNull();
        expect(await store.load("tenant-alpha", sid2!)).toBeNull();
        expect(await store.load("tenant-alpha", sid3!)).toBeNull();
        expect(await store.load("tenant-alpha", sid4!)).not.toBeNull();
    });
});

describe("Token replay prevention", () => {
    it("destroyed session cannot be loaded again (replay attack)", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid = await store.create("tenant-alpha", sampleInput());

        // Attacker captures the sid
        const capturedSid = sid;

        // User logs out (session destroyed)
        await store.destroy("tenant-alpha", sid);

        // Attacker tries to replay the captured sid
        const session = await store.load("tenant-alpha", capturedSid);
        expect(session).toBeNull();
    });

    it("mass revocation prevents all session replays for a user", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid1 = await store.create("tenant-alpha", sampleInput());
        const sid2 = await store.create("tenant-alpha", sampleInput());
        const sid3 = await store.create("tenant-alpha", sampleInput());

        // Attacker captures all sids
        const capturedSids = [sid1, sid2, sid3];

        // Admin triggers mass revocation (IAM change, account compromise)
        await store.destroyAllForUser("tenant-alpha", "user-1");

        // None of the captured sids should work
        for (const sid of capturedSids) {
            const session = await store.load("tenant-alpha", sid);
            expect(session).toBeNull();
        }
    });

    it("update does not allow overriding immutable fields", async () => {
        const cache = createMockCache();
        const store = new RedisSessionStore(cache);

        const sid = await store.create("tenant-alpha", sampleInput());

        // Attempt to override immutable fields via update
        await store.update("tenant-alpha", sid, {
            tenantId: "tenant-evil" as any,
            sid: "evil-sid" as any,
            version: 99 as any,
            createdAt: 0 as any,
        });

        const session = await store.load("tenant-alpha", sid);
        expect(session).not.toBeNull();
        expect(session!.tenantId).toBe("tenant-alpha"); // immutable
        expect(session!.sid).toBe(sid); // immutable
        expect(session!.version).toBe(1); // immutable
        expect(session!.createdAt).toBeGreaterThan(0); // immutable
    });
});
