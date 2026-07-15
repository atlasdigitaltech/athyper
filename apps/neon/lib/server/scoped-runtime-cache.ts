import "server-only";

export interface RuntimeCacheIdentity {
  tenant: string;
  plane: string;
  realm: string;
  entity: string;
  principal: string;
  permissionStamp: string;
}

export interface RuntimeCacheInvalidationScope {
  tenant?: string;
  plane?: string;
  realm?: string;
  entity?: string;
  principal?: string;
  permissionStamp?: string;
  reason: string;
}

interface RuntimeCacheEntry<T> {
  value: T;
  identity: RuntimeCacheIdentity;
  generation: number;
  expiresAt: number;
}

interface RecordedInvalidation {
  scope: RuntimeCacheInvalidationScope;
  generation: number;
}

export class ScopedRuntimeCache<T> {
  private readonly entries = new Map<string, RuntimeCacheEntry<T>>();
  private readonly tenantEntityIndex = new Map<string, Set<string>>();
  private readonly principalPermissionIndex = new Map<string, Set<string>>();
  private readonly invalidations: RecordedInvalidation[] = [];
  private latestGeneration = 0;
  private minimumRetainedGeneration = 0;

  constructor(private readonly options: {
    limit: number;
    ttlMs: number;
    now?: () => number;
    onEvict?: (value: T) => void;
  }) {}

  get generation(): number {
    return this.latestGeneration;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, identity: RuntimeCacheIdentity, generation: number): boolean {
    if (this.wasInvalidatedSince(identity, generation)) return false;
    this.delete(key);
    this.entries.set(key, {
      value,
      identity,
      generation,
      expiresAt: this.now() + this.options.ttlMs,
    });
    addIndex(this.tenantEntityIndex, tenantEntityKey(identity), key);
    addIndex(this.principalPermissionIndex, principalPermissionKey(identity), key);
    while (this.entries.size > this.options.limit) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.delete(oldest);
    }
    return true;
  }

  invalidate(scope: RuntimeCacheInvalidationScope, generation?: number): number {
    const effectiveGeneration = Math.max(this.latestGeneration + 1, generation ?? 0);
    this.latestGeneration = effectiveGeneration;
    this.invalidations.push({ scope, generation: effectiveGeneration });
    if (this.invalidations.length > 1_000) {
      const removed = this.invalidations.shift();
      if (removed) this.minimumRetainedGeneration = removed.generation;
    }

    const candidates = this.candidateKeys(scope);
    let removed = 0;
    for (const key of candidates) {
      const entry = this.entries.get(key);
      if (entry && matchesScope(entry.identity, scope)) {
        this.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(reason = "operational_fallback", generation?: number): number {
    return this.invalidate({ reason }, generation);
  }

  private candidateKeys(scope: RuntimeCacheInvalidationScope): Iterable<string> {
    if (scope.tenant !== undefined && scope.entity !== undefined) {
      return [...(this.tenantEntityIndex.get(`${scope.tenant}\u0000${scope.entity}`) ?? [])];
    }
    if (scope.principal !== undefined && scope.permissionStamp !== undefined) {
      return [...(this.principalPermissionIndex.get(`${scope.principal}\u0000${scope.permissionStamp}`) ?? [])];
    }
    return [...this.entries.keys()];
  }

  private wasInvalidatedSince(identity: RuntimeCacheIdentity, generation: number): boolean {
    if (generation < this.minimumRetainedGeneration) return true;
    return this.invalidations.some((item) =>
      item.generation > generation && matchesScope(identity, item.scope));
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    removeIndex(this.tenantEntityIndex, tenantEntityKey(entry.identity), key);
    removeIndex(this.principalPermissionIndex, principalPermissionKey(entry.identity), key);
    this.options.onEvict?.(entry.value);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function matchesScope(identity: RuntimeCacheIdentity, scope: RuntimeCacheInvalidationScope): boolean {
  return (scope.tenant === undefined || scope.tenant === identity.tenant)
    && (scope.plane === undefined || scope.plane === identity.plane)
    && (scope.realm === undefined || scope.realm === identity.realm)
    && (scope.entity === undefined || scope.entity === identity.entity)
    && (scope.principal === undefined || scope.principal === identity.principal)
    && (scope.permissionStamp === undefined || scope.permissionStamp === identity.permissionStamp);
}

function tenantEntityKey(identity: RuntimeCacheIdentity): string {
  return `${identity.tenant}\u0000${identity.entity}`;
}

function principalPermissionKey(identity: RuntimeCacheIdentity): string {
  return `${identity.principal}\u0000${identity.permissionStamp}`;
}

function addIndex(index: Map<string, Set<string>>, indexKey: string, cacheKey: string): void {
  const keys = index.get(indexKey) ?? new Set<string>();
  keys.add(cacheKey);
  index.set(indexKey, keys);
}

function removeIndex(index: Map<string, Set<string>>, indexKey: string, cacheKey: string): void {
  const keys = index.get(indexKey);
  if (!keys) return;
  keys.delete(cacheKey);
  if (keys.size === 0) index.delete(indexKey);
}
