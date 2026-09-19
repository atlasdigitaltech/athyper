import type {
  PolicyDefinition,
  PolicyRepository,
  PolicyRepositoryQuery,
} from "@athyper/server-contract-policy";

export interface CachedPolicyRepositoryOptions<Transaction> {
  readonly repository: PolicyRepository<Transaction>;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly now?: () => number;
}
export interface CachedPolicyRepository<
  Transaction,
> extends PolicyRepository<Transaction> {
  clear(tenantId?: string): void;
}

export function createCachedPolicyRepository<Transaction>(
  options: CachedPolicyRepositoryOptions<Transaction>,
): CachedPolicyRepository<Transaction> {
  const ttlMs = options.ttlMs ?? 30_000;
  const maxEntries = options.maxEntries ?? 1_000;
  const cache = new Map<
    string,
    { tenantId: string; expiresAt: number; value: readonly PolicyDefinition[] }
  >();
  return {
    async findExact(query, transaction) {
      if (!options.repository.findExact)
        throw new Error("POLICY_EXACT_REVISION_UNAVAILABLE");
      return options.repository.findExact(query, transaction);
    },
    async findActive(query, transaction) {
      if (!query.planeKey)
        return options.repository.findActive(query, transaction);
      const key = cacheKey(query);
      const now = options.now?.() ?? Date.now();
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now) {
        cache.delete(key);
        cache.set(key, cached);
        return cached.value;
      }
      const value = await options.repository.findActive(query, transaction);
      cache.set(key, {
        tenantId: query.tenantId,
        expiresAt: now + ttlMs,
        value,
      });
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
      return value;
    },
    clear(tenantId) {
      if (!tenantId) cache.clear();
      else
        for (const [key, entry] of cache)
          if (entry.tenantId === tenantId) cache.delete(key);
    },
  };
}
function cacheKey(query: PolicyRepositoryQuery): string {
  return JSON.stringify([
    query.planeKey,
    query.tenantId,
    query.entityType,
    query.effectiveOn,
    query.policyDefinitionIds === undefined
      ? null
      : [...query.policyDefinitionIds].sort(),
  ]);
}
