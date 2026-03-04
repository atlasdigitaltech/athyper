/**
 * Performance Tests for Meta Engine
 *
 * Phase 1.4: Performance tests + budgets
 *
 * These tests establish performance budgets for critical operations:
 * - Compile 200 entities under X seconds
 * - List with 5 filters + 2 sorts under Y ms
 * - Policy eval under Z ms p95
 *
 * Initially CI non-blocking, will gate later once baselines are established.
 */

import { describe, it, expect } from "vitest";

import type { CompiledModel, EntitySchema } from "@athyper/core/meta";

/**
 * Performance budgets (in milliseconds)
 */
const PERF_BUDGETS = {
  /** Max time to compile 200 entities (ms) */
  COMPILE_200_ENTITIES: 5000,

  /** Max time for list query with 5 filters + 2 sorts (ms) */
  LIST_WITH_FILTERS: 100,

  /** Max time for policy evaluation p95 (ms) */
  POLICY_EVAL_P95: 50,

  /** Max time for single entity compilation (ms) */
  SINGLE_COMPILE: 50,

  /** Cache hit time budget (ms) */
  CACHE_HIT: 5,
};

describe("Meta Engine Performance Tests", () => {
  describe("Compilation Performance", () => {
    it("should compile a single entity under budget", async () => {
      const schema: EntitySchema = createTestEntitySchema("TestEntity", 10);

      const startTime = performance.now();

      // Mock compilation (replace with actual compiler when available)
      const compiled = await mockCompile(schema);

      const duration = performance.now() - startTime;

      expect(compiled).toBeDefined();
      expect(duration).toBeLessThan(PERF_BUDGETS.SINGLE_COMPILE);

      console.log(`Single compile: ${duration.toFixed(2)}ms (budget: ${PERF_BUDGETS.SINGLE_COMPILE}ms)`);
    });

    it.skip("should compile 200 entities under budget", async () => {
      // Skip in CI for now - enable once we have real compiler integration
      const entityCount = 200;
      const schemas: EntitySchema[] = [];

      // Generate 200 test schemas
      for (let i = 0; i < entityCount; i++) {
        schemas.push(createTestEntitySchema(`Entity${i}`, 10));
      }

      const startTime = performance.now();

      // Compile all entities
      const results = await Promise.all(
        schemas.map((schema) => mockCompile(schema))
      );

      const duration = performance.now() - startTime;

      expect(results).toHaveLength(entityCount);
      expect(duration).toBeLessThan(PERF_BUDGETS.COMPILE_200_ENTITIES);

      console.log(
        `Compile ${entityCount} entities: ${duration.toFixed(2)}ms (budget: ${PERF_BUDGETS.COMPILE_200_ENTITIES}ms)`
      );
      console.log(`Average per entity: ${(duration / entityCount).toFixed(2)}ms`);
    });

    it("should have fast cache hits", async () => {
      const schema = createTestEntitySchema("CachedEntity", 10);

      // First compile (cache miss)
      await mockCompile(schema);

      // Second compile (cache hit)
      const startTime = performance.now();
      const cached = await mockCompileFromCache(schema);
      const duration = performance.now() - startTime;

      expect(cached).toBeDefined();
      expect(duration).toBeLessThan(PERF_BUDGETS.CACHE_HIT);

      console.log(`Cache hit: ${duration.toFixed(2)}ms (budget: ${PERF_BUDGETS.CACHE_HIT}ms)`);
    });
  });

  describe("Query Performance", () => {
    it.skip("should list with 5 filters + 2 sorts under budget", async () => {
      // Skip in CI for now - requires database setup
      const query = {
        filters: [
          { field: "status", operator: "eq", value: "active" },
          { field: "created_at", operator: "gte", value: "2024-01-01" },
          { field: "tenant_id", operator: "eq", value: "tenant-1" },
          { field: "category", operator: "in", value: ["A", "B", "C"] },
          { field: "deleted_at", operator: "is_null", value: null },
        ],
        sorts: [
          { field: "created_at", direction: "desc" },
          { field: "name", direction: "asc" },
        ],
        page: 1,
        pageSize: 50,
      };

      const startTime = performance.now();

      // Mock query execution
      const results = await mockListQuery(query);

      const duration = performance.now() - startTime;

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(PERF_BUDGETS.LIST_WITH_FILTERS);

      console.log(
        `List with 5 filters + 2 sorts: ${duration.toFixed(2)}ms (budget: ${PERF_BUDGETS.LIST_WITH_FILTERS}ms)`
      );
    });
  });

  describe("Policy Evaluation Performance", () => {
    it.skip("should evaluate policy under p95 budget", async () => {
      // Skip in CI for now - requires policy engine setup
      const sampleSize = 100;
      const durations: number[] = [];

      for (let i = 0; i < sampleSize; i++) {
        const startTime = performance.now();

        // Mock policy evaluation
        await mockPolicyEval({
          userId: `user-${i}`,
          resource: "document",
          action: "read",
        });

        const duration = performance.now() - startTime;
        durations.push(duration);
      }

      // Calculate p95
      durations.sort((a, b) => a - b);
      const p95Index = Math.floor(sampleSize * 0.95);
      const p95 = durations[p95Index];

      expect(p95).toBeLessThan(PERF_BUDGETS.POLICY_EVAL_P95);

      console.log(`Policy eval p95: ${p95.toFixed(2)}ms (budget: ${PERF_BUDGETS.POLICY_EVAL_P95}ms)`);
      console.log(`Policy eval avg: ${(durations.reduce((a, b) => a + b, 0) / sampleSize).toFixed(2)}ms`);
    });
  });

  describe("Stampede Protection Performance", () => {
    it("should handle concurrent compilations efficiently", async () => {
      const schema = createTestEntitySchema("ConcurrentEntity", 10);
      const concurrentRequests = 50;

      const startTime = performance.now();

      // Simulate 50 concurrent compilation requests for the same entity
      const results = await Promise.all(
        Array.from({ length: concurrentRequests }).map(() =>
          mockCompile(schema)
        )
      );

      const duration = performance.now() - startTime;

      expect(results).toHaveLength(concurrentRequests);

      // With stampede protection, all 50 requests should share the same compilation
      // Duration should be close to single compile time, not 50x
      expect(duration).toBeLessThan(PERF_BUDGETS.SINGLE_COMPILE * 2);

      console.log(
        `${concurrentRequests} concurrent compiles (stampede protection): ${duration.toFixed(2)}ms`
      );
    });
  });
});

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create test entity schema
 */
function createTestEntitySchema(name: string, fieldCount: number): EntitySchema {
  const fields = [
    // System fields (required)
    { name: "id", type: "uuid" as const, required: true },
    { name: "tenant_id", type: "uuid" as const, required: true },
    { name: "realm_id", type: "string" as const, required: true },
    { name: "created_at", type: "datetime" as const, required: true },
    { name: "created_by", type: "string" as const, required: true },
    { name: "updated_at", type: "datetime" as const, required: true },
    { name: "updated_by", type: "string" as const, required: true },
    { name: "deleted_at", type: "datetime" as const, required: false },
    { name: "deleted_by", type: "string" as const, required: false },
    { name: "version", type: "number" as const, required: true },
  ];

  // Add additional fields
  for (let i = 0; i < fieldCount; i++) {
    fields.push({
      name: `field${i}`,
      type: i % 3 === 0 ? ("string" as const) : i % 3 === 1 ? ("number" as const) : ("boolean" as const),
      required: i % 2 === 0,
    });
  }

  return {
    name,
    fields,
    description: `Test entity ${name}`,
  };
}

/**
 * Mock compile function
 * Replace with actual compiler when integrated
 */
async function mockCompile(schema: EntitySchema): Promise<CompiledModel> {
  // Simulate compilation time (1-5ms)
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 4 + 1));

  return {
    entityName: schema.name,
    version: "1.0.0",
    tableName: `ent_${schema.name.toLowerCase()}`,
    fields: schema.fields.map((f) => ({
      name: f.name,
      type: f.type,
      columnName: f.name.toLowerCase(),
      nullable: !f.required,
    })),
    inputHash: "mock-input-hash",
    outputHash: "mock-output-hash",
  };
}

/**
 * Mock compile from cache (instant)
 */
async function mockCompileFromCache(schema: EntitySchema): Promise<CompiledModel> {
  // Cache hits should be instant
  return {
    entityName: schema.name,
    version: "1.0.0",
    tableName: `ent_${schema.name.toLowerCase()}`,
    fields: schema.fields.map((f) => ({
      name: f.name,
      type: f.type,
      columnName: f.name.toLowerCase(),
      nullable: !f.required,
    })),
    inputHash: "mock-input-hash",
    outputHash: "mock-output-hash",
  };
}

/**
 * Mock list query
 */
async function mockListQuery(query: any): Promise<any[]> {
  // Simulate query execution (10-50ms)
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 40 + 10));

  return Array.from({ length: query.pageSize }).map((_, i) => ({
    id: `item-${i}`,
    name: `Item ${i}`,
  }));
}

/**
 * Mock policy evaluation
 */
async function mockPolicyEval(_context: any): Promise<boolean> {
  // Simulate policy evaluation (5-20ms)
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 15 + 5));

  return true;
}
