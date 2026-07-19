import { describe, expect, it, vi } from "vitest";
import {
  buildSessionConfigurationCacheKey,
  SessionConfigurationCache,
  type SessionConfigurationIdentity,
} from "@/lib/server/session-configuration-cache";

const identity: SessionConfigurationIdentity = {
  tenantId: "tenant-1",
  planeKey: "neon",
  realmKey: "athyper",
  principalId: "principal-1",
  activeOrganizationId: "org-1",
  legalEntityId: "le-1",
  companyCodeId: "cc-1",
  permissionStamp: "stamp-1",
  configurationVersion: "1",
};

const policy = {
  freshForMs: 10,
  staleForMs: 20,
};

describe("SessionConfigurationCache", () => {
  it("uses an explicit stable key and isolates security context", () => {
    const first = buildSessionConfigurationCacheKey("api.search", identity, { entity: "journal_entry" });
    const same = buildSessionConfigurationCacheKey("api.search", identity, { entity: "journal_entry" });
    const otherPrincipal = buildSessionConfigurationCacheKey(
      "api.search",
      { ...identity, principalId: "principal-2" },
      { entity: "journal_entry" },
    );
    expect(first).toBe(same);
    expect(first).not.toBe(otherPrincipal);
    expect(first).toContain("principal-1");
  });

  it("returns fresh hits and emits structured diagnostics", async () => {
    let now = 0;
    const diagnostics = vi.fn();
    const cache = new SessionConfigurationCache({ limit: 2, now: () => now, onDiagnostic: diagnostics });
    const loader = vi.fn(async () => ({ value: 1 }));
    const input = { namespace: "api.search", sessionIdentity: identity, loader, policy };

    await expect(cache.get(input)).resolves.toEqual({ value: 1 });
    now = 5;
    await expect(cache.get(input)).resolves.toEqual({ value: 1 });

    expect(loader).toHaveBeenCalledOnce();
    expect(diagnostics.mock.calls.map(([event]) => event.cacheState)).toEqual(["miss", "hit"]);
    expect(diagnostics.mock.calls[1]?.[0]).toMatchObject({
      event: "session_configuration_cache",
      namespace: "api.search",
      keyHash: expect.any(String),
      outcome: "success",
    });
  });

  it("does not fail a successful load when a diagnostic sink throws", async () => {
    const cache = new SessionConfigurationCache({
      limit: 2,
      onDiagnostic: () => {
        throw new Error("diagnostic transport unavailable");
      },
    });

    await expect(cache.get({
      namespace: "config.resilient",
      sessionIdentity: identity,
      loader: async () => "ready",
      policy,
    })).resolves.toBe("ready");
  });

  it("serves stale data while one background revalidation refreshes it", async () => {
    let now = 0;
    const cache = new SessionConfigurationCache({ limit: 2, now: () => now });
    const refresh = deferred<{ value: number }>();
    const loader = vi.fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockReturnValueOnce(refresh.promise);
    const input = { namespace: "api.list", sessionIdentity: identity, loader, policy };

    await expect(cache.get(input)).resolves.toEqual({ value: 1 });
    now = 11;
    await expect(cache.get(input)).resolves.toEqual({ value: 1 });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.pendingLoads).toBe(1);

    refresh.resolve({ value: 2 });
    await refresh.promise;
    await Promise.resolve();
    now = 12;
    await expect(cache.get(input)).resolves.toEqual({ value: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent misses", async () => {
    const cache = new SessionConfigurationCache({ limit: 2 });
    const pending = deferred<string>();
    const loader = vi.fn(() => pending.promise);
    const diagnostics = vi.fn();
    const input = {
      namespace: "saved_views",
      sessionIdentity: identity,
      keyParts: { entity: "journal_entry" },
      loader,
      policy,
      onDiagnostic: diagnostics,
    };

    const first = cache.get(input);
    const second = cache.get(input);
    expect(loader).toHaveBeenCalledOnce();
    pending.resolve("ready");
    await expect(Promise.all([first, second])).resolves.toEqual(["ready", "ready"]);
    expect(diagnostics.mock.calls.some(([event]) => event.coalesced === true)).toBe(true);
  });

  it("does not cache failures", async () => {
    const cache = new SessionConfigurationCache({ limit: 2 });
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("upstream failed"))
      .mockResolvedValueOnce("recovered");
    const input = { namespace: "feature.snapshot", sessionIdentity: identity, loader, policy };

    await expect(cache.get(input)).rejects.toThrow("upstream failed");
    await expect(cache.get(input)).resolves.toBe("recovered");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not retain implicit negative values unless a short policy allows it", async () => {
    let now = 0;
    const cache = new SessionConfigurationCache({ limit: 2, now: () => now });
    const uncachedLoader = vi.fn(async () => null);
    const baseInput = { namespace: "default_view", sessionIdentity: identity, loader: uncachedLoader, policy };

    await cache.get(baseInput);
    await cache.get(baseInput);
    expect(uncachedLoader).toHaveBeenCalledTimes(2);

    const cachedLoader = vi.fn(async () => null);
    const negativeInput = {
      ...baseInput,
      namespace: "default_view.safe",
      loader: cachedLoader,
      policy: { ...policy, negative: { freshForMs: 3 } },
    };
    await cache.get(negativeInput);
    now = 2;
    await cache.get(negativeInput);
    expect(cachedLoader).toHaveBeenCalledOnce();
    now = 4;
    await cache.get(negativeInput);
    expect(cachedLoader).toHaveBeenCalledTimes(2);
  });

  it("prevents an invalidated in-flight load from repopulating the cache", async () => {
    const cache = new SessionConfigurationCache({ limit: 2 });
    const pending = deferred<string>();
    const loader = vi.fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce("new");
    const input = {
      namespace: "permission_aliases",
      sessionIdentity: identity,
      loader,
      policy,
    };

    const first = cache.get(input);
    cache.invalidate({ tenantId: "tenant-1", reason: "permission_change" }, 7);
    pending.resolve("old");
    await expect(first).resolves.toBe("old");
    await expect(cache.get(input)).resolves.toBe("new");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("evicts the least-recently-used entry at the configured bound", async () => {
    const cache = new SessionConfigurationCache({ limit: 2 });
    const load = async (namespace: string) => cache.get({
      namespace,
      sessionIdentity: identity,
      loader: vi.fn(async () => namespace),
      policy,
    });

    await load("config.one");
    await load("config.two");
    await load("config.three");
    expect(cache.size).toBe(2);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
