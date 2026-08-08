import { describe, expect, it, vi } from "vitest";

import { terminateFrontendSessions } from "../termination.service.js";

type MockCache = {
  smembers: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  _store: Map<string, Set<string>>;
};

function makeMockCache(initialSets: Record<string, string[]> = {}): MockCache {
  const store = new Map<string, Set<string>>(
    Object.entries(initialSets).map(([k, v]) => [k, new Set(v)]),
  );
  const cache: MockCache = {
    _store: store,
    smembers: vi.fn().mockImplementation(async (key: string) => [...(store.get(key) ?? [])]),
    del: vi.fn().mockImplementation(async (...args: (string | string[])[]) => {
      const keys = args.flat();
      let count = 0;
      for (const key of keys) {
        if (store.has(key)) {
          store.delete(key);
          count++;
        }
      }
      return count;
    }),
  };
  return cache;
}

// ── Realm-scoped index cleanup ────────────────────────────────────────────────

describe("terminateFrontendSessions — realm_subject_sessions index", () => {
  it("deletes sess: keys listed in the realm index", async () => {
    const cache = makeMockCache({
      "realm_subject_sessions:athyper:sub-1": ["neon:sid-aaa", "neon:sid-bbb"],
    });

    await terminateFrontendSessions(cache, "sub-1", "athyper");

    expect(cache.del).toHaveBeenCalledWith("sess:neon:sid-aaa");
    expect(cache.del).toHaveBeenCalledWith("sess:neon:sid-bbb");
  });

  it("deletes the realm index key itself after draining entries", async () => {
    const cache = makeMockCache({
      "realm_subject_sessions:athyper:sub-1": ["neon:sid-aaa"],
    });

    await terminateFrontendSessions(cache, "sub-1", "athyper");

    expect(cache.del).toHaveBeenCalledWith("realm_subject_sessions:athyper:sub-1");
  });

  it("returns the number of sess: keys terminated", async () => {
    const cache = makeMockCache({
      "realm_subject_sessions:athyper:sub-2": ["neon:sid-x", "admin:sid-y", "mesh:sid-z"],
    });

    const count = await terminateFrontendSessions(cache, "sub-2", "athyper");

    expect(count).toBe(3);
  });

  it("returns 0 and does not error when index is empty", async () => {
    const cache = makeMockCache({});
    const count = await terminateFrontendSessions(cache, "sub-absent", "athyper");
    expect(count).toBe(0);
  });

  it("Redis key count drops to zero after logout (before: 3 sess keys + 1 index; after: 0)", async () => {
    const cache = makeMockCache({
      "realm_subject_sessions:athyper:sub-3": ["neon:sid-1", "neon:sid-2", "neon:sid-3"],
      "sess:neon:sid-1": [],
      "sess:neon:sid-2": [],
      "sess:neon:sid-3": [],
    });
    expect(cache._store.size).toBe(4);

    await terminateFrontendSessions(cache, "sub-3", "athyper");

    expect(cache._store.size).toBe(0);
  });
});

// ── No-realmKey path: scans both default realms ───────────────────────────────

describe("terminateFrontendSessions — omitted realmKey scans both default realms", () => {
  it("terminates sessions from both athyper and platform-control realms", async () => {
    const cache = makeMockCache({
      "realm_subject_sessions:athyper:sub-4": ["neon:sid-a"],
      "realm_subject_sessions:platform-control:sub-4": ["admin:sid-b"],
    });

    const count = await terminateFrontendSessions(cache, "sub-4");

    expect(count).toBeGreaterThanOrEqual(2);
    expect(cache.del).toHaveBeenCalledWith("sess:neon:sid-a");
    expect(cache.del).toHaveBeenCalledWith("sess:admin:sid-b");
  });
});

// ── Compat cleanup for pre-realm-index sessions ───────────────────────────────

describe("terminateFrontendSessions — compat user_sessions index", () => {
  it("deletes sess: keys from legacy user_sessions index", async () => {
    const cache = makeMockCache({
      "user_sessions:neon:sub-5": ["legacy-sid-1", "legacy-sid-2"],
    });

    await terminateFrontendSessions(cache, "sub-5");

    expect(cache.del).toHaveBeenCalledWith(["sess:neon:legacy-sid-1", "sess:neon:legacy-sid-2"]);
  });

  it("deletes the compat index key after draining", async () => {
    const cache = makeMockCache({
      "user_sessions:neon:sub-6": ["legacy-sid-x"],
    });

    await terminateFrontendSessions(cache, "sub-6");

    expect(cache.del).toHaveBeenCalledWith("user_sessions:neon:sub-6");
  });

  it("counts compat sessions toward the returned total", async () => {
    const cache = makeMockCache({
      "user_sessions:mesh:sub-7": ["sid-p", "sid-q"],
    });

    const count = await terminateFrontendSessions(cache, "sub-7");

    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── Idempotency and isolation ─────────────────────────────────────────────────

describe("terminateFrontendSessions — idempotency", () => {
  it("second call with same sub returns 0 (keys already gone)", async () => {
    const cache = makeMockCache({
      "realm_subject_sessions:athyper:sub-8": ["neon:sid-only"],
    });

    await terminateFrontendSessions(cache, "sub-8", "athyper");
    const secondCount = await terminateFrontendSessions(cache, "sub-8", "athyper");

    expect(secondCount).toBe(0);
  });
});
