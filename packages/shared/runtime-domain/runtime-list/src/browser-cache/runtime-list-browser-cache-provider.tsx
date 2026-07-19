"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  RUNTIME_LIST_INVALIDATION_EVENT,
  type RuntimeListInvalidationDetail,
} from "@athyper/runtime-shared/client";
import {
  RuntimeListBrowserCache,
  type RuntimeListBrowserCacheLimits,
} from "./runtime-list-browser-cache";

export const RUNTIME_LIST_CONTEXT_SWITCH_EVENT = "athyper:session-context-change";
export const RUNTIME_LIST_MEMORY_PRESSURE_EVENT = "athyper:memory-pressure";
export const RUNTIME_LIST_TENANT_CHANGE_EVENT = "athyper:tenant-change";
export const RUNTIME_LIST_ORGANIZATION_CHANGE_EVENT = "athyper:active-organization-change";
export const RUNTIME_LIST_PERMISSION_STAMP_CHANGE_EVENT = "athyper:permission-stamp-change";

const RuntimeListBrowserCacheContext = createContext<RuntimeListBrowserCache | null>(null);
const SESSION_CACHE_STORAGE_KEY = "athyper:runtime-list-cache:v1";
const SESSION_CACHE_MAX_SERIALIZED_CHARS = 2 * 1024 * 1024;

interface RuntimeListSessionStorageEnvelope {
  version: 1;
  scopeHash: string;
  cache: ReturnType<RuntimeListBrowserCache["exportSessionSnapshot"]>;
}

export function RuntimeListBrowserCacheProvider({
  children,
  scopeIdentity,
  limits,
  instance,
}: {
  children: ReactNode;
  scopeIdentity: string;
  limits?: RuntimeListBrowserCacheLimits;
  /** Optional controlled instance for tests and host-level cache orchestration. */
  instance?: RuntimeListBrowserCache;
}) {
  const scopeHash = useMemo(() => hashScopeIdentity(scopeIdentity), [scopeIdentity]);
  const cacheRef = useRef<RuntimeListBrowserCache | null>(null);
  if (!cacheRef.current) cacheRef.current = instance ?? new RuntimeListBrowserCache(limits);
  const cache = cacheRef.current;
  const previousScopeRef = useRef(scopeIdentity);
  const restoredScopeHashRef = useRef<string | null>(null);

  // Context changes must synchronously invalidate before descendants can read
  // entries using the next authenticated scope.
  if (previousScopeRef.current !== scopeIdentity) {
    cache.clear();
    previousScopeRef.current = scopeIdentity;
  }
  // Restore before descendants initialize their list state. Restoring in a
  // passive effect is too late because useRuntimeListSearch has already read
  // the empty cache by then.
  if (typeof window !== "undefined" && restoredScopeHashRef.current !== scopeHash) {
    restoreSessionCache(cache, scopeHash, window.sessionStorage);
    restoredScopeHashRef.current = scopeHash;
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let persistTimer: number | null = null;
    const persist = () => {
      if (persistTimer) window.clearTimeout(persistTimer);
      persistTimer = null;
      persistSessionCache(cache, scopeHash, window.sessionStorage);
    };
    const schedulePersist = () => {
      if (persistTimer) return;
      persistTimer = window.setTimeout(persist, 50);
    };
    const unsubscribe = cache.subscribe(schedulePersist);
    window.addEventListener("pagehide", persist);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [cache, scopeHash]);

  useEffect(() => {
    const clear = () => cache.clear();
    const onInvalidation = (event: Event) => {
      const detail = event instanceof CustomEvent
        ? event.detail as RuntimeListInvalidationDetail | undefined
        : undefined;
      if (!detail) return;
      if (detail.scope === "all") cache.clear();
      else cache.invalidateEntity(detail.entityCode);
    };
    const onMemoryPressure = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { level?: unknown } | undefined : undefined;
      cache.evictForMemoryPressure(detail?.level === "critical" ? "critical" : "moderate");
    };
    const inspectMemory = () => {
      const level = detectBrowserMemoryPressure();
      if (level) cache.evictForMemoryPressure(level);
    };

    window.addEventListener("athyper:session-logout", clear);
    window.addEventListener("athyper:session-expired", clear);
    window.addEventListener("athyper:auth-failure", clear);
    window.addEventListener(RUNTIME_LIST_CONTEXT_SWITCH_EVENT, clear);
    window.addEventListener(RUNTIME_LIST_TENANT_CHANGE_EVENT, clear);
    window.addEventListener(RUNTIME_LIST_ORGANIZATION_CHANGE_EVENT, clear);
    window.addEventListener(RUNTIME_LIST_PERMISSION_STAMP_CHANGE_EVENT, clear);
    window.addEventListener(RUNTIME_LIST_INVALIDATION_EVENT, onInvalidation);
    window.addEventListener(RUNTIME_LIST_MEMORY_PRESSURE_EVENT, onMemoryPressure);
    window.addEventListener("memorypressure", onMemoryPressure);
    document.addEventListener("visibilitychange", inspectMemory);
    return () => {
      window.removeEventListener("athyper:session-logout", clear);
      window.removeEventListener("athyper:session-expired", clear);
      window.removeEventListener("athyper:auth-failure", clear);
      window.removeEventListener(RUNTIME_LIST_CONTEXT_SWITCH_EVENT, clear);
      window.removeEventListener(RUNTIME_LIST_TENANT_CHANGE_EVENT, clear);
      window.removeEventListener(RUNTIME_LIST_ORGANIZATION_CHANGE_EVENT, clear);
      window.removeEventListener(RUNTIME_LIST_PERMISSION_STAMP_CHANGE_EVENT, clear);
      window.removeEventListener(RUNTIME_LIST_INVALIDATION_EVENT, onInvalidation);
      window.removeEventListener(RUNTIME_LIST_MEMORY_PRESSURE_EVENT, onMemoryPressure);
      window.removeEventListener("memorypressure", onMemoryPressure);
      document.removeEventListener("visibilitychange", inspectMemory);
    };
  }, [cache]);

  return (
    <RuntimeListBrowserCacheContext.Provider value={cache}>
      {children}
    </RuntimeListBrowserCacheContext.Provider>
  );
}

export function restoreSessionCache(
  cache: RuntimeListBrowserCache,
  scopeHash: string,
  storage: Pick<Storage, "getItem" | "removeItem">,
): number {
  try {
    const raw = storage.getItem(SESSION_CACHE_STORAGE_KEY);
    if (!raw) return 0;
    const envelope = JSON.parse(raw) as Partial<RuntimeListSessionStorageEnvelope>;
    if (envelope.version !== 1 || envelope.scopeHash !== scopeHash || !envelope.cache) {
      storage.removeItem(SESSION_CACHE_STORAGE_KEY);
      return 0;
    }
    return cache.hydrateSessionSnapshot(envelope.cache);
  } catch {
    storage.removeItem(SESSION_CACHE_STORAGE_KEY);
    return 0;
  }
}

export function persistSessionCache(
  cache: RuntimeListBrowserCache,
  scopeHash: string,
  storage: Pick<Storage, "setItem" | "removeItem">,
): number {
  const cacheSnapshot = cache.exportSessionSnapshot();
  if (cacheSnapshot.entries.length === 0) {
    storage.removeItem(SESSION_CACHE_STORAGE_KEY);
    return 0;
  }

  const envelope: RuntimeListSessionStorageEnvelope = {
    version: 1,
    scopeHash,
    cache: cacheSnapshot,
  };
  let serialized = JSON.stringify(envelope);
  while (serialized.length > SESSION_CACHE_MAX_SERIALIZED_CHARS && envelope.cache.entries.length > 0) {
    envelope.cache.entries.shift();
    serialized = JSON.stringify(envelope);
  }
  if (envelope.cache.entries.length === 0) {
    storage.removeItem(SESSION_CACHE_STORAGE_KEY);
    return 0;
  }

  try {
    storage.setItem(SESSION_CACHE_STORAGE_KEY, serialized);
    return envelope.cache.entries.length;
  } catch {
    storage.removeItem(SESSION_CACHE_STORAGE_KEY);
    return 0;
  }
}

export function useRuntimeListBrowserCache(): RuntimeListBrowserCache {
  const cache = useContext(RuntimeListBrowserCacheContext);
  if (!cache) throw new Error("RuntimeListBrowserCacheProvider must be mounted inside the authenticated shell.");
  return cache;
}

export function runtimeListSessionScopeIdentity(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "anonymous";
  const session = value as Record<string, unknown>;
  const activeOrg = typeof session["activeOrg"] === "string" ? session["activeOrg"] : "none";
  const organizations = session["organizations"] && typeof session["organizations"] === "object"
    && !Array.isArray(session["organizations"])
    ? session["organizations"] as Record<string, unknown>
    : {};
  const membership = organizations[activeOrg] && typeof organizations[activeOrg] === "object"
    && !Array.isArray(organizations[activeOrg])
    ? organizations[activeOrg] as Record<string, unknown>
    : {};
  return JSON.stringify([
    session["userId"] ?? "unknown-user",
    activeOrg,
    session["activeWorkbench"] ?? "none",
    membership["tenantId"] ?? "none",
    membership["organizationId"] ?? "none",
    membership["contextType"] ?? "none",
    session["permissionStamp"] ?? session["permission_stamp"] ?? session["authEpoch"] ??
      membership["permissionStamp"] ?? membership["permission_stamp"] ?? "none",
    Array.isArray(membership["roles"])
      ? [...membership["roles"] as unknown[]].map(String).sort()
      : [],
  ]);
}

export function runtimeListSessionScopeHash(value: unknown): string {
  return hashScopeIdentity(runtimeListSessionScopeIdentity(value));
}

function hashScopeIdentity(value: string): string {
  // The scope itself contains principal and organization identifiers. Keep
  // those values out of storage keys while retaining deterministic tab scope.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function detectBrowserMemoryPressure(): "moderate" | "critical" | null {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
  }).memory;
  const used = memory?.usedJSHeapSize;
  const limit = memory?.jsHeapSizeLimit;
  if (!Number.isFinite(used) || !Number.isFinite(limit) || !used || !limit) return null;
  const ratio = used / limit;
  if (ratio >= 0.9) return "critical";
  if (ratio >= 0.75) return "moderate";
  return null;
}
