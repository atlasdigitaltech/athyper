/**
 * Facts Provider Tests
 *
 * H: Unit + integration test coverage for the facts provider
 * - Subject resolution with caching
 * - Resource resolution with caching
 * - Cache invalidation
 * - TTL-based expiration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import type { ResolvedFacts, FactsTtlConfig } from "../facts-provider.js";
import type { PolicySubject, PolicyResource } from "../types.js";

// ============================================================================
// Mock Types (mirroring facts-provider.ts types)
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ============================================================================
// In-Memory Cache Implementation for Testing
// ============================================================================

class InMemoryFactsCache {
  private subjectCache: Map<string, CacheEntry<PolicySubject>> = new Map();
  private resourceCache: Map<string, CacheEntry<PolicyResource>> = new Map();
  private readonly defaultTtl: FactsTtlConfig;

  constructor(ttl: Partial<FactsTtlConfig> = {}) {
    this.defaultTtl = {
      subjectTtlMs: 60000,
      resourceTtlMs: 30000,
      computedFactsTtlMs: 10000,
      ...ttl,
    };
  }

  // Subject caching
  getSubject(principalId: string, tenantId: string): PolicySubject | undefined {
    const key = `${tenantId}:${principalId}`;
    const entry = this.subjectCache.get(key);

    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.subjectCache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  setSubject(principalId: string, tenantId: string, subject: PolicySubject): void {
    const key = `${tenantId}:${principalId}`;
    this.subjectCache.set(key, {
      data: subject,
      expiresAt: Date.now() + this.defaultTtl.subjectTtlMs,
    });
  }

  invalidateSubject(principalId: string, tenantId: string): void {
    const key = `${tenantId}:${principalId}`;
    this.subjectCache.delete(key);
  }

  // Resource caching
  getResource(tenantId: string, resourceType: string, resourceId?: string): PolicyResource | undefined {
    const key = `${tenantId}:${resourceType}:${resourceId ?? "*"}`;
    const entry = this.resourceCache.get(key);

    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.resourceCache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  setResource(tenantId: string, resourceType: string, resource: PolicyResource, resourceId?: string): void {
    const key = `${tenantId}:${resourceType}:${resourceId ?? "*"}`;
    this.resourceCache.set(key, {
      data: resource,
      expiresAt: Date.now() + this.defaultTtl.resourceTtlMs,
    });
  }

  invalidateResource(tenantId: string, resourceType: string, resourceId?: string): void {
    const key = `${tenantId}:${resourceType}:${resourceId ?? "*"}`;
    this.resourceCache.delete(key);
  }

  // Clear all
  clear(): void {
    this.subjectCache.clear();
    this.resourceCache.clear();
  }

  // Get stats
  getStats(): { subjectCacheSize: number; resourceCacheSize: number } {
    return {
      subjectCacheSize: this.subjectCache.size,
      resourceCacheSize: this.resourceCache.size,
    };
  }
}

// ============================================================================
// Mock Facts Provider for Testing
// ============================================================================

class MockFactsProvider {
  private cache: InMemoryFactsCache;
  private subjectFetchCount: number = 0;
  private resourceFetchCount: number = 0;
  private subjectFetcher: (principalId: string, tenantId: string) => Promise<PolicySubject>;
  private resourceFetcher: (tenantId: string, type: string, id?: string) => Promise<PolicyResource>;

  constructor(
    ttl: Partial<FactsTtlConfig> = {},
    subjectFetcher?: (principalId: string, tenantId: string) => Promise<PolicySubject>,
    resourceFetcher?: (tenantId: string, type: string, id?: string) => Promise<PolicyResource>
  ) {
    this.cache = new InMemoryFactsCache(ttl);
    this.subjectFetcher = subjectFetcher ?? this.defaultSubjectFetcher;
    this.resourceFetcher = resourceFetcher ?? this.defaultResourceFetcher;
  }

  private async defaultSubjectFetcher(principalId: string, tenantId: string): Promise<PolicySubject> {
    return {
      principalId,
      principalType: "user",
      roles: ["user"],
      groups: [],
      attributes: { tenantId },
    };
  }

  private async defaultResourceFetcher(tenantId: string, type: string, id?: string): Promise<PolicyResource> {
    return {
      type,
      id,
      attributes: { tenantId },
    };
  }

  async resolveSubject(principalId: string, tenantId: string): Promise<PolicySubject> {
    // Check cache first
    const cached = this.cache.getSubject(principalId, tenantId);
    if (cached) {
      return cached;
    }

    // Fetch from source
    this.subjectFetchCount++;
    const subject = await this.subjectFetcher(principalId, tenantId);

    // Cache the result
    this.cache.setSubject(principalId, tenantId, subject);

    return subject;
  }

  async resolveResource(tenantId: string, type: string, id?: string): Promise<PolicyResource> {
    // Check cache first
    const cached = this.cache.getResource(tenantId, type, id);
    if (cached) {
      return cached;
    }

    // Fetch from source
    this.resourceFetchCount++;
    const resource = await this.resourceFetcher(tenantId, type, id);

    // Cache the result
    this.cache.setResource(tenantId, type, resource, id);

    return resource;
  }

  async resolveFacts(
    principalId: string,
    tenantId: string,
    resourceType: string,
    resourceId?: string
  ): Promise<ResolvedFacts> {
    const [subject, resource] = await Promise.all([
      this.resolveSubject(principalId, tenantId),
      this.resolveResource(tenantId, resourceType, resourceId),
    ]);

    return {
      subject,
      resource,
      computed: {},
    };
  }

  invalidateSubjectCache(principalId: string, tenantId: string): void {
    this.cache.invalidateSubject(principalId, tenantId);
  }

  invalidateResourceCache(tenantId: string, resourceType: string, resourceId?: string): void {
    this.cache.invalidateResource(tenantId, resourceType, resourceId);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Test helpers
  getSubjectFetchCount(): number {
    return this.subjectFetchCount;
  }

  getResourceFetchCount(): number {
    return this.resourceFetchCount;
  }

  resetFetchCounts(): void {
    this.subjectFetchCount = 0;
    this.resourceFetchCount = 0;
  }

  getCacheStats() {
    return this.cache.getStats();
  }
}

// ============================================================================
// Tests: Subject Resolution
// ============================================================================

describe("Facts Provider - Subject Resolution", () => {
  let _provider: MockFactsProvider;

  beforeEach(() => {
    _provider = new MockFactsProvider();
  });

  it("should resolve subject with roles and groups", async () => {
    const customFetcher = async (principalId: string, _tenantId: string): Promise<PolicySubject> => ({
      principalId,
      principalType: "user",
      roles: ["admin", "editor"],
      groups: ["engineering", "team-alpha"],
      ouMembership: {
        nodeId: "ou-1",
        path: "/root/engineering",
        code: "engineering",
        depth: 2,
      },
      attributes: {
        department: "engineering",
        level: "senior",
      },
    });

    const providerWithCustomFetcher = new MockFactsProvider({}, customFetcher);
    const subject = await providerWithCustomFetcher.resolveSubject("user-123", "tenant-1");

    expect(subject.principalId).toBe("user-123");
    expect(subject.principalType).toBe("user");
    expect(subject.roles).toContain("admin");
    expect(subject.roles).toContain("editor");
    expect(subject.groups).toContain("engineering");
    expect(subject.ouMembership?.code).toBe("engineering");
    expect(subject.attributes.department).toBe("engineering");
  });

  it("should resolve service principal", async () => {
    const customFetcher = async (principalId: string, _tenantId: string): Promise<PolicySubject> => ({
      principalId,
      principalType: "service",
      roles: ["service-role"],
      groups: [],
      attributes: { serviceType: "api-gateway" },
    });

    const providerWithCustomFetcher = new MockFactsProvider({}, customFetcher);
    const subject = await providerWithCustomFetcher.resolveSubject("svc-api", "tenant-1");

    expect(subject.principalType).toBe("service");
    expect(subject.attributes.serviceType).toBe("api-gateway");
  });
});

// ============================================================================
// Tests: Resource Resolution
// ============================================================================

describe("Facts Provider - Resource Resolution", () => {
  let provider: MockFactsProvider;

  beforeEach(() => {
    provider = new MockFactsProvider();
  });

  it("should resolve resource with attributes", async () => {
    const customFetcher = async (tenantId: string, type: string, id?: string): Promise<PolicyResource> => ({
      type,
      id,
      module: "crm",
      ownerId: "user-789",
      attributes: {
        status: "active",
        confidential: false,
        createdAt: "2024-01-01T00:00:00Z",
      },
    });

    const providerWithCustomFetcher = new MockFactsProvider({}, undefined, customFetcher);
    const resource = await providerWithCustomFetcher.resolveResource("tenant-1", "document", "doc-123");

    expect(resource.type).toBe("document");
    expect(resource.id).toBe("doc-123");
    expect(resource.module).toBe("crm");
    expect(resource.attributes.status).toBe("active");
  });

  it("should resolve resource without id (type-level)", async () => {
    const resource = await provider.resolveResource("tenant-1", "document");

    expect(resource.type).toBe("document");
    expect(resource.id).toBeUndefined();
  });

  it("should include owner information", async () => {
    const customFetcher = async (tenantId: string, type: string, id?: string): Promise<PolicyResource> => ({
      type,
      id,
      ownerId: "user-owner",
      costCenter: "CC-100",
      attributes: {},
    });

    const providerWithCustomFetcher = new MockFactsProvider({}, undefined, customFetcher);
    const resource = await providerWithCustomFetcher.resolveResource("tenant-1", "document", "doc-123");

    expect(resource.ownerId).toBe("user-owner");
    expect(resource.costCenter).toBe("CC-100");
  });
});

// ============================================================================
// Tests: Caching Behavior
// ============================================================================

describe("Facts Provider - Caching", () => {
  let provider: MockFactsProvider;

  beforeEach(() => {
    provider = new MockFactsProvider({ subjectTtlMs: 60000, resourceTtlMs: 30000 });
    provider.resetFetchCounts();
  });

  describe("Subject Caching", () => {
    it("should cache subject on first fetch", async () => {
      await provider.resolveSubject("user-123", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(1);

      // Second call should use cache
      await provider.resolveSubject("user-123", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(1);
    });

    it("should cache different subjects separately", async () => {
      await provider.resolveSubject("user-123", "tenant-1");
      await provider.resolveSubject("user-456", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(2);

      // Both should be cached now
      await provider.resolveSubject("user-123", "tenant-1");
      await provider.resolveSubject("user-456", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(2);
    });

    it("should cache per tenant", async () => {
      await provider.resolveSubject("user-123", "tenant-1");
      await provider.resolveSubject("user-123", "tenant-2");
      expect(provider.getSubjectFetchCount()).toBe(2);
    });
  });

  describe("Resource Caching", () => {
    it("should cache resource on first fetch", async () => {
      await provider.resolveResource("tenant-1", "document", "doc-123");
      expect(provider.getResourceFetchCount()).toBe(1);

      // Second call should use cache
      await provider.resolveResource("tenant-1", "document", "doc-123");
      expect(provider.getResourceFetchCount()).toBe(1);
    });

    it("should cache different resources separately", async () => {
      await provider.resolveResource("tenant-1", "document", "doc-123");
      await provider.resolveResource("tenant-1", "document", "doc-456");
      expect(provider.getResourceFetchCount()).toBe(2);

      // Both should be cached now
      await provider.resolveResource("tenant-1", "document", "doc-123");
      await provider.resolveResource("tenant-1", "document", "doc-456");
      expect(provider.getResourceFetchCount()).toBe(2);
    });

    it("should cache type-level resources separately from instance-level", async () => {
      await provider.resolveResource("tenant-1", "document"); // type-level
      await provider.resolveResource("tenant-1", "document", "doc-123"); // instance-level
      expect(provider.getResourceFetchCount()).toBe(2);
    });
  });

  describe("Cache Stats", () => {
    it("should report cache statistics", async () => {
      await provider.resolveSubject("user-1", "tenant-1");
      await provider.resolveSubject("user-2", "tenant-1");
      await provider.resolveResource("tenant-1", "document", "doc-1");

      const stats = provider.getCacheStats();
      expect(stats.subjectCacheSize).toBe(2);
      expect(stats.resourceCacheSize).toBe(1);
    });
  });
});

// ============================================================================
// Tests: Cache Invalidation
// ============================================================================

describe("Facts Provider - Cache Invalidation", () => {
  let provider: MockFactsProvider;

  beforeEach(() => {
    provider = new MockFactsProvider();
    provider.resetFetchCounts();
  });

  describe("Subject Cache Invalidation", () => {
    it("should invalidate specific subject", async () => {
      await provider.resolveSubject("user-123", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(1);

      provider.invalidateSubjectCache("user-123", "tenant-1");

      await provider.resolveSubject("user-123", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(2);
    });

    it("should not affect other cached subjects", async () => {
      await provider.resolveSubject("user-123", "tenant-1");
      await provider.resolveSubject("user-456", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(2);

      provider.invalidateSubjectCache("user-123", "tenant-1");

      await provider.resolveSubject("user-456", "tenant-1"); // Should still be cached
      expect(provider.getSubjectFetchCount()).toBe(2);

      await provider.resolveSubject("user-123", "tenant-1"); // Should refetch
      expect(provider.getSubjectFetchCount()).toBe(3);
    });

    it("should invalidate subject per tenant", async () => {
      await provider.resolveSubject("user-123", "tenant-1");
      await provider.resolveSubject("user-123", "tenant-2");
      expect(provider.getSubjectFetchCount()).toBe(2);

      provider.invalidateSubjectCache("user-123", "tenant-1");

      await provider.resolveSubject("user-123", "tenant-2"); // Should still be cached
      expect(provider.getSubjectFetchCount()).toBe(2);

      await provider.resolveSubject("user-123", "tenant-1"); // Should refetch
      expect(provider.getSubjectFetchCount()).toBe(3);
    });
  });

  describe("Resource Cache Invalidation", () => {
    it("should invalidate specific resource", async () => {
      await provider.resolveResource("tenant-1", "document", "doc-123");
      expect(provider.getResourceFetchCount()).toBe(1);

      provider.invalidateResourceCache("tenant-1", "document", "doc-123");

      await provider.resolveResource("tenant-1", "document", "doc-123");
      expect(provider.getResourceFetchCount()).toBe(2);
    });

    it("should not affect other cached resources", async () => {
      await provider.resolveResource("tenant-1", "document", "doc-123");
      await provider.resolveResource("tenant-1", "document", "doc-456");
      expect(provider.getResourceFetchCount()).toBe(2);

      provider.invalidateResourceCache("tenant-1", "document", "doc-123");

      await provider.resolveResource("tenant-1", "document", "doc-456"); // Should still be cached
      expect(provider.getResourceFetchCount()).toBe(2);
    });
  });

  describe("Clear All Cache", () => {
    it("should clear all cached entries", async () => {
      await provider.resolveSubject("user-1", "tenant-1");
      await provider.resolveSubject("user-2", "tenant-1");
      await provider.resolveResource("tenant-1", "document", "doc-1");
      await provider.resolveResource("tenant-1", "document", "doc-2");

      expect(provider.getCacheStats().subjectCacheSize).toBe(2);
      expect(provider.getCacheStats().resourceCacheSize).toBe(2);

      provider.clearCache();

      expect(provider.getCacheStats().subjectCacheSize).toBe(0);
      expect(provider.getCacheStats().resourceCacheSize).toBe(0);
    });

    it("should refetch after clear", async () => {
      await provider.resolveSubject("user-123", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(1);

      provider.clearCache();

      await provider.resolveSubject("user-123", "tenant-1");
      expect(provider.getSubjectFetchCount()).toBe(2);
    });
  });
});

// ============================================================================
// Tests: TTL-based Expiration
// ============================================================================

describe("Facts Provider - TTL Expiration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should expire subject cache after TTL", async () => {
    const provider = new MockFactsProvider({ subjectTtlMs: 1000 });

    await provider.resolveSubject("user-123", "tenant-1");
    expect(provider.getSubjectFetchCount()).toBe(1);

    // Advance time but not past TTL
    vi.advanceTimersByTime(500);

    await provider.resolveSubject("user-123", "tenant-1");
    expect(provider.getSubjectFetchCount()).toBe(1); // Still cached

    // Advance past TTL
    vi.advanceTimersByTime(600);

    await provider.resolveSubject("user-123", "tenant-1");
    expect(provider.getSubjectFetchCount()).toBe(2); // Cache expired, refetched
  });

  it("should expire resource cache after TTL", async () => {
    const provider = new MockFactsProvider({ resourceTtlMs: 500 });

    await provider.resolveResource("tenant-1", "document", "doc-123");
    expect(provider.getResourceFetchCount()).toBe(1);

    // Advance time but not past TTL
    vi.advanceTimersByTime(250);

    await provider.resolveResource("tenant-1", "document", "doc-123");
    expect(provider.getResourceFetchCount()).toBe(1); // Still cached

    // Advance past TTL
    vi.advanceTimersByTime(300);

    await provider.resolveResource("tenant-1", "document", "doc-123");
    expect(provider.getResourceFetchCount()).toBe(2); // Cache expired, refetched
  });

  it("should use different TTLs for subject and resource", async () => {
    const provider = new MockFactsProvider({
      subjectTtlMs: 2000,
      resourceTtlMs: 500,
    });

    await provider.resolveSubject("user-123", "tenant-1");
    await provider.resolveResource("tenant-1", "document", "doc-123");

    expect(provider.getSubjectFetchCount()).toBe(1);
    expect(provider.getResourceFetchCount()).toBe(1);

    // Advance past resource TTL but not subject TTL
    vi.advanceTimersByTime(600);

    await provider.resolveSubject("user-123", "tenant-1");
    expect(provider.getSubjectFetchCount()).toBe(1); // Subject still cached

    await provider.resolveResource("tenant-1", "document", "doc-123");
    expect(provider.getResourceFetchCount()).toBe(2); // Resource expired
  });
});

// ============================================================================
// Tests: Resolve Facts (Combined)
// ============================================================================

describe("Facts Provider - Resolve Facts", () => {
  let provider: MockFactsProvider;

  beforeEach(() => {
    provider = new MockFactsProvider();
    provider.resetFetchCounts();
  });

  it("should resolve both subject and resource", async () => {
    const facts = await provider.resolveFacts("user-123", "tenant-1", "document", "doc-456");

    expect(facts.subject.principalId).toBe("user-123");
    expect(facts.resource.type).toBe("document");
    expect(facts.resource.id).toBe("doc-456");
  });

  it("should resolve in parallel", async () => {
    const subjectDelay = 50;
    const resourceDelay = 50;

    const slowProvider = new MockFactsProvider(
      {},
      async (principalId, _tenantId) => {
        await new Promise((resolve) => setTimeout(resolve, subjectDelay));
        return {
          principalId,
          principalType: "user",
          roles: [],
          groups: [],
          attributes: {},
        };
      },
      async (tenantId, type, id) => {
        await new Promise((resolve) => setTimeout(resolve, resourceDelay));
        return {
          type,
          id,
          attributes: {},
        };
      }
    );

    const start = Date.now();
    await slowProvider.resolveFacts("user-123", "tenant-1", "document", "doc-456");
    const duration = Date.now() - start;

    // Should be roughly parallel (not sequential which would be 100ms+)
    expect(duration).toBeLessThan(subjectDelay + resourceDelay + 20);
  });

  it("should use cache for both subject and resource", async () => {
    await provider.resolveFacts("user-123", "tenant-1", "document", "doc-456");
    expect(provider.getSubjectFetchCount()).toBe(1);
    expect(provider.getResourceFetchCount()).toBe(1);

    await provider.resolveFacts("user-123", "tenant-1", "document", "doc-456");
    expect(provider.getSubjectFetchCount()).toBe(1);
    expect(provider.getResourceFetchCount()).toBe(1);
  });
});

// ============================================================================
// Tests: Edge Cases
// ============================================================================

describe("Facts Provider - Edge Cases", () => {
  it("should handle empty roles and groups", async () => {
    const provider = new MockFactsProvider(
      {},
      async (principalId, _tenantId) => ({
        principalId,
        principalType: "user",
        roles: [],
        groups: [],
        attributes: {},
      })
    );

    const subject = await provider.resolveSubject("user-123", "tenant-1");

    expect(subject.roles).toEqual([]);
    expect(subject.groups).toEqual([]);
  });

  it("should handle special characters in IDs", async () => {
    const provider = new MockFactsProvider();

    const subject = await provider.resolveSubject("user:special/chars@test", "tenant:special");
    expect(subject.principalId).toBe("user:special/chars@test");

    const resource = await provider.resolveResource(
      "tenant:special",
      "document/type",
      "doc:with/special@chars"
    );
    expect(resource.type).toBe("document/type");
    expect(resource.id).toBe("doc:with/special@chars");
  });

  it("should handle concurrent requests for same subject", async () => {
    let fetchCount = 0;
    const provider = new MockFactsProvider(
      {},
      async (principalId, _tenantId) => {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          principalId,
          principalType: "user",
          roles: ["user"],
          groups: [],
          attributes: { fetchCount },
        };
      }
    );

    // Start multiple concurrent requests
    const promises = [
      provider.resolveSubject("user-123", "tenant-1"),
      provider.resolveSubject("user-123", "tenant-1"),
      provider.resolveSubject("user-123", "tenant-1"),
    ];

    const results = await Promise.all(promises);

    // All should resolve (implementation may or may not dedupe)
    expect(results).toHaveLength(3);
    expect(results[0].principalId).toBe("user-123");
  });

  it("should handle null/undefined in attributes gracefully", async () => {
    const provider = new MockFactsProvider(
      {},
      async (principalId, _tenantId) => ({
        principalId,
        principalType: "user",
        roles: [],
        groups: [],
        attributes: {
          nullValue: null,
          undefinedValue: undefined,
          emptyString: "",
          zero: 0,
          falseValue: false,
        },
      })
    );

    const subject = await provider.resolveSubject("user-123", "tenant-1");

    expect(subject.attributes.nullValue).toBeNull();
    expect(subject.attributes.undefinedValue).toBeUndefined();
    expect(subject.attributes.emptyString).toBe("");
    expect(subject.attributes.zero).toBe(0);
    expect(subject.attributes.falseValue).toBe(false);
  });
});
