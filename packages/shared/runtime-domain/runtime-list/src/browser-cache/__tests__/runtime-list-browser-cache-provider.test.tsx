import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRuntimeListCache,
  invalidateRuntimeListEntity,
} from "@athyper/runtime-shared/client";

import {
  DEFAULT_RUNTIME_LIST_CACHE_POLICY,
  RuntimeListBrowserCache,
} from "../runtime-list-browser-cache";
import {
  RUNTIME_LIST_CONTEXT_SWITCH_EVENT,
  RUNTIME_LIST_MEMORY_PRESSURE_EVENT,
  RuntimeListBrowserCacheProvider,
  persistSessionCache,
  restoreSessionCache,
  runtimeListSessionScopeIdentity,
  runtimeListSessionScopeHash,
} from "../runtime-list-browser-cache-provider";

const cacheIdentity = {
  entityCode: "journal_entry",
  queryKey: "query-1",
  descriptorHash: "descriptor-v1",
  scopeFingerprint: "scope-v1",
  policy: DEFAULT_RUNTIME_LIST_CACHE_POLICY,
} as const;

function seed(cache: RuntimeListBrowserCache): void {
  cache.write(cacheIdentity, {
    pages: [[1, {
      rows: [{ id: "1" }],
      savedAt: 1,
      lastAccessed: 1,
    }]],
  });
}

describe("RuntimeListBrowserCacheProvider lifecycle", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("clears on logout and context-switch events", () => {
    const cache = new RuntimeListBrowserCache();
    seed(cache);
    render(
      <RuntimeListBrowserCacheProvider scopeIdentity="scope-1" instance={cache}>
        <div />
      </RuntimeListBrowserCacheProvider>,
    );

    act(() => window.dispatchEvent(new Event("athyper:session-logout")));
    expect(cache.stats().queries).toBe(0);

    seed(cache);
    act(() => window.dispatchEvent(new Event(RUNTIME_LIST_CONTEXT_SWITCH_EVENT)));
    expect(cache.stats().queries).toBe(0);

    seed(cache);
    act(() => window.dispatchEvent(new Event("athyper:session-expired")));
    expect(cache.stats().queries).toBe(0);
  });

  it("evicts on memory-pressure events and scope identity changes", () => {
    const cache = new RuntimeListBrowserCache();
    seed(cache);
    const view = render(
      <RuntimeListBrowserCacheProvider scopeIdentity="scope-1" instance={cache}>
        <div />
      </RuntimeListBrowserCacheProvider>,
    );

    act(() => window.dispatchEvent(new CustomEvent(RUNTIME_LIST_MEMORY_PRESSURE_EVENT, {
      detail: { level: "critical" },
    })));
    expect(cache.stats().queries).toBe(0);

    seed(cache);
    view.rerender(
      <RuntimeListBrowserCacheProvider scopeIdentity="scope-2" instance={cache}>
        <div />
      </RuntimeListBrowserCacheProvider>,
    );
    expect(cache.stats().queries).toBe(0);
  });

  it("handles common entity and full-cache invalidation events", () => {
    const cache = new RuntimeListBrowserCache();
    seed(cache);
    cache.write({ ...cacheIdentity, entityCode: "purchase_order" }, {
      pages: [[1, { rows: [{ id: "po-1" }], savedAt: 1, lastAccessed: 1 }]],
    });
    render(
      <RuntimeListBrowserCacheProvider scopeIdentity="scope-1" instance={cache}>
        <div />
      </RuntimeListBrowserCacheProvider>,
    );

    act(() => invalidateRuntimeListEntity("journal_entry", "edit"));
    expect(cache.stats()).toMatchObject({ entities: 1, queries: 1 });

    act(() => clearRuntimeListCache("permission_stamp_change"));
    expect(cache.stats().queries).toBe(0);
  });

  it("changes shell scope for tenant, organization, and permission changes", () => {
    const session = {
      userId: "user-1",
      activeOrg: "org-1",
      authEpoch: 7,
      organizations: { "org-1": { tenantId: "tenant-1", roles: ["viewer"] } },
    };
    const initial = runtimeListSessionScopeIdentity(session);

    expect(runtimeListSessionScopeIdentity({
      ...session,
      organizations: { "org-1": { tenantId: "tenant-2", roles: ["viewer"] } },
    })).not.toBe(initial);
    expect(runtimeListSessionScopeIdentity({ ...session, activeOrg: "org-2" })).not.toBe(initial);
    expect(runtimeListSessionScopeIdentity({ ...session, authEpoch: 8 })).not.toBe(initial);
    expect(runtimeListSessionScopeIdentity({
      ...session,
      organizations: { "org-1": { tenantId: "tenant-1", roles: ["editor"] } },
    })).not.toBe(initial);
  });

  it("persists session-policy rows under an opaque authenticated scope", () => {
    const cache = new RuntimeListBrowserCache();
    const sessionIdentity = {
      ...cacheIdentity,
      policy: { ...DEFAULT_RUNTIME_LIST_CACHE_POLICY, storage: "session" as const },
    };
    cache.write(sessionIdentity, {
      pages: [[1, { rows: [{ id: "1" }], savedAt: Date.now(), lastAccessed: Date.now() }]],
    });
    const session = {
      userId: "user-1",
      activeOrg: "org-1",
      organizations: { "org-1": { tenantId: "tenant-1", roles: ["viewer"] } },
    };
    const scopeHash = runtimeListSessionScopeHash(session);

    expect(persistSessionCache(cache, scopeHash, window.sessionStorage)).toBe(1);
    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem(window.sessionStorage.key(0)!)).not.toContain("user-1");

    const restored = new RuntimeListBrowserCache();
    expect(restoreSessionCache(restored, scopeHash, window.sessionStorage)).toBe(1);
    expect(restored.read(sessionIdentity).state).toBe("fresh");
  });

  it("rejects a persisted cache from another authenticated scope", () => {
    const cache = new RuntimeListBrowserCache();
    const sessionIdentity = {
      ...cacheIdentity,
      policy: { ...DEFAULT_RUNTIME_LIST_CACHE_POLICY, storage: "session" as const },
    };
    cache.write(sessionIdentity, {
      pages: [[1, { rows: [{ id: "1" }], savedAt: Date.now(), lastAccessed: Date.now() }]],
    });
    persistSessionCache(cache, "scope-a", window.sessionStorage);

    expect(restoreSessionCache(new RuntimeListBrowserCache(), "scope-b", window.sessionStorage)).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
