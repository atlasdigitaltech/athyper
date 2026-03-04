/**
 * Approver Resolver Service Tests
 *
 * Tests all resolution strategies:
 * - direct: backward-compatible principal_id/group_id assignment
 * - role: expand principals by role code (with optional OU scope)
 * - group: expand principals by group code
 * - hierarchy: walk OU parent chain to find manager
 * - department: find principals in an OU
 * - custom_field: match principals by metadata JSONB field
 *
 * Also tests:
 * - Condition evaluation integration (shared evaluator)
 * - Priority-based rule ordering
 * - Redis caching (hit/miss)
 * - Fallback when cache unavailable
 */

import { describe, it, expect, vi } from "vitest";

import { ApproverResolverService } from "../approval/approver-resolver.service.js";

import type { RoutingRule } from "../approval/approver-resolver.service.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockDb(queryResults: Array<{ rows: any[] }>) {
  let callIndex = 0;

  const executeQueryFn = vi.fn(async () => {
    const result = queryResults[callIndex] ?? { rows: [] };
    callIndex++;
    return result;
  });

  return {
    db: {
      getExecutor: vi.fn(() => ({
        transformQuery: vi.fn((node: any) => node),
        compileQuery: vi.fn((node: any) => ({
          sql: "mock-sql",
          parameters: [],
          query: node,
        })),
        executeQuery: executeQueryFn,
      })),
    } as any,
    executeQueryFn,
    getCallIndex: () => callIndex,
  };
}

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    _store: store,
  } as any;
}

function makeRule(
  overrides: Partial<RoutingRule> & Pick<RoutingRule, "assign_to">,
): RoutingRule {
  return {
    id: overrides.id ?? `rule-${Math.random().toString(36).slice(2, 8)}`,
    conditions: overrides.conditions ?? null,
    assign_to: overrides.assign_to,
    priority: overrides.priority ?? 100,
  };
}

const TENANT = "tenant-1";

// ============================================================================
// Tests
// ============================================================================

describe("ApproverResolverService", () => {
  describe("direct strategy", () => {
    it("should resolve a single principal_id", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "direct", principal_id: "user-1" } })],
        {},
        TENANT,
      );

      expect(result).toEqual([{ principalId: "user-1", ruleId: expect.any(String) }]);
    });

    it("should resolve a single group_id", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "direct", group_id: "grp-1" } })],
        {},
        TENANT,
      );

      expect(result).toEqual([{ groupId: "grp-1", ruleId: expect.any(String) }]);
    });

    it("should resolve multiple assignees from array", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({
          assign_to: {
            strategy: "direct",
            assignees: [
              { principal_id: "user-1" },
              { principal_id: "user-2" },
              { group_id: "grp-1" },
            ],
          },
        })],
        {},
        TENANT,
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ principalId: "user-1" });
      expect(result[1]).toMatchObject({ principalId: "user-2" });
      expect(result[2]).toMatchObject({ groupId: "grp-1" });
    });

    it("should default to direct strategy when strategy is missing", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      // No strategy field — backward compatible with Phase 1 format
      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { principal_id: "user-1" } })],
        {},
        TENANT,
      );

      expect(result).toEqual([{ principalId: "user-1", ruleId: expect.any(String) }]);
    });
  });

  describe("role strategy", () => {
    it("should expand principals by role code", async () => {
      const { db } = createMockDb([
        { rows: [{ principal_id: "user-A" }, { principal_id: "user-B" }] },
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "role", role_code: "approver" } })],
        {},
        TENANT,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ principalId: "user-A" });
      expect(result[1]).toMatchObject({ principalId: "user-B" });
    });

    it("should scope role resolution to an OU", async () => {
      const { db } = createMockDb([
        { rows: [{ principal_id: "user-scoped" }] },
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "role", role_code: "manager", ou_scope: "finance" } })],
        {},
        TENANT,
      );

      expect(result).toEqual([{ principalId: "user-scoped", ruleId: expect.any(String) }]);
    });

    it("should return empty when no principals have the role", async () => {
      const { db } = createMockDb([{ rows: [] }]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "role", role_code: "nonexistent" } })],
        {},
        TENANT,
      );

      expect(result).toEqual([]);
    });
  });

  describe("group strategy", () => {
    it("should expand group members by group code", async () => {
      const { db } = createMockDb([
        { rows: [{ principal_id: "user-X" }, { principal_id: "user-Y" }] },
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "group", group_code: "finance-approvers" } })],
        {},
        TENANT,
      );

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.principalId)).toEqual(["user-X", "user-Y"]);
    });
  });

  describe("hierarchy strategy", () => {
    it("should find direct manager (skip_levels=1)", async () => {
      const { db } = createMockDb([
        // 1. Find requester's OU
        { rows: [{ id: "ou-team", parent_id: "ou-dept" }] },
        // 2. Find principals in parent OU (manager)
        { rows: [{ principal_id: "manager-1" }] },
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "hierarchy", skip_levels: 1 } })],
        { requester_id: "user-1" },
        TENANT,
      );

      expect(result).toEqual([{ principalId: "manager-1", ruleId: expect.any(String) }]);
    });

    it("should walk multiple levels (skip_levels=2)", async () => {
      const { db } = createMockDb([
        // 1. Find requester's OU
        { rows: [{ id: "ou-team", parent_id: "ou-dept" }] },
        // 2. Walk one more level: get parent of ou-dept
        { rows: [{ parent_id: "ou-division" }] },
        // 3. Find principals in target OU
        { rows: [{ principal_id: "director-1" }] },
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "hierarchy", skip_levels: 2 } })],
        { requester_id: "user-1" },
        TENANT,
      );

      expect(result).toEqual([{ principalId: "director-1", ruleId: expect.any(String) }]);
    });

    it("should return empty when requester has no OU", async () => {
      const { db } = createMockDb([
        { rows: [] }, // No OU for requester
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "hierarchy", skip_levels: 1 } })],
        { requester_id: "orphan-user" },
        TENANT,
      );

      expect(result).toEqual([]);
    });
  });

  describe("department strategy", () => {
    it("should find principals in an OU by code", async () => {
      const { db } = createMockDb([
        { rows: [{ principal_id: "dept-user-1" }, { principal_id: "dept-user-2" }] },
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "department", department_code: "HR" } })],
        {},
        TENANT,
      );

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.principalId)).toEqual(["dept-user-1", "dept-user-2"]);
    });

    it("should also accept ou_code as alias", async () => {
      const { db } = createMockDb([
        { rows: [{ principal_id: "ou-user" }] },
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "department", ou_code: "LEGAL" } })],
        {},
        TENANT,
      );

      expect(result).toEqual([{ principalId: "ou-user", ruleId: expect.any(String) }]);
    });
  });

  describe("custom_field strategy", () => {
    it("should find principals by metadata field", async () => {
      const { db } = createMockDb([
        { rows: [{ principal_id: "cc-user-1" }] },
      ]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({
          assign_to: { strategy: "custom_field", field_path: "cost_center", field_value: "CC-100" },
        })],
        {},
        TENANT,
      );

      expect(result).toEqual([{ principalId: "cc-user-1", ruleId: expect.any(String) }]);
    });
  });

  describe("condition evaluation", () => {
    it("should skip rules whose conditions do not match", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const rules = [
        makeRule({
          id: "rule-skip",
          priority: 1,
          conditions: {
            operator: "and",
            conditions: [{ field: "amount", operator: "gt", value: 10000 }],
          },
          assign_to: { strategy: "direct", principal_id: "high-approver" },
        }),
        makeRule({
          id: "rule-match",
          priority: 2,
          conditions: {
            operator: "and",
            conditions: [{ field: "amount", operator: "lte", value: 10000 }],
          },
          assign_to: { strategy: "direct", principal_id: "low-approver" },
        }),
      ];

      const result = await resolver.resolveAssignees(rules, { amount: 5000 }, TENANT);

      expect(result).toEqual([{ principalId: "low-approver", ruleId: "rule-match" }]);
    });

    it("should match first rule when conditions are satisfied", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const rules = [
        makeRule({
          id: "rule-1",
          priority: 1,
          conditions: {
            operator: "and",
            conditions: [
              { field: "department", operator: "eq", value: "finance" },
            ],
          },
          assign_to: { strategy: "direct", principal_id: "finance-approver" },
        }),
      ];

      const result = await resolver.resolveAssignees(
        rules,
        { department: "finance" },
        TENANT,
      );

      expect(result).toEqual([{ principalId: "finance-approver", ruleId: "rule-1" }]);
    });

    it("should evaluate OR conditions", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const rules = [
        makeRule({
          id: "rule-or",
          conditions: {
            operator: "or",
            conditions: [
              { field: "region", operator: "eq", value: "US" },
              { field: "region", operator: "eq", value: "EU" },
            ],
          },
          assign_to: { strategy: "direct", principal_id: "regional-approver" },
        }),
      ];

      expect(await resolver.resolveAssignees(rules, { region: "EU" }, TENANT))
        .toEqual([{ principalId: "regional-approver", ruleId: "rule-or" }]);

      expect(await resolver.resolveAssignees(rules, { region: "APAC" }, TENANT))
        .toEqual([]);
    });

    it("should skip rules with null/empty conditions (unconditional match)", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      // Rule with null conditions should match unconditionally
      const result = await resolver.resolveAssignees(
        [makeRule({
          conditions: null,
          assign_to: { strategy: "direct", principal_id: "default-approver" },
        })],
        {},
        TENANT,
      );

      expect(result).toEqual([{ principalId: "default-approver", ruleId: expect.any(String) }]);
    });
  });

  describe("priority ordering", () => {
    it("should evaluate lower priority numbers first", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const rules = [
        makeRule({
          id: "low-priority",
          priority: 200,
          assign_to: { strategy: "direct", principal_id: "fallback" },
        }),
        makeRule({
          id: "high-priority",
          priority: 10,
          assign_to: { strategy: "direct", principal_id: "primary" },
        }),
      ];

      const result = await resolver.resolveAssignees(rules, {}, TENANT);
      expect(result).toEqual([{ principalId: "primary", ruleId: "high-priority" }]);
    });
  });

  describe("caching", () => {
    it("should cache role resolution results in Redis", async () => {
      const { db } = createMockDb([
        { rows: [{ principal_id: "cached-user" }] },
      ]);
      const cache = createMockRedis();
      const resolver = new ApproverResolverService(db, cache);

      // First call — cache miss, hits DB
      const result1 = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "role", role_code: "approver" } })],
        {},
        TENANT,
      );

      expect(result1).toHaveLength(1);
      expect(cache.set).toHaveBeenCalled();

      // Verify the cache key pattern
      const setCall = cache.set.mock.calls[0];
      expect(setCall[0]).toMatch(/^approver:tenant-1:role:approver:/);
      expect(setCall[2]).toBe("EX");
      expect(setCall[3]).toBe(300);
    });

    it("should use cached results on subsequent calls", async () => {
      const { db } = createMockDb([]);
      const cache = createMockRedis();

      // Pre-seed cache
      cache._store.set(
        "approver:tenant-1:group:finance-team",
        JSON.stringify(["cached-1", "cached-2"]),
      );

      const resolver = new ApproverResolverService(db, cache);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "group", group_code: "finance-team" } })],
        {},
        TENANT,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ principalId: "cached-1" });
      expect(result[1]).toMatchObject({ principalId: "cached-2" });
      // DB should NOT have been called (cache hit)
      expect(db.getExecutor().executeQuery).not.toHaveBeenCalled();
    });

    it("should work without cache (graceful degradation)", async () => {
      const { db } = createMockDb([
        { rows: [{ principal_id: "no-cache-user" }] },
      ]);
      // No cache provided
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "role", role_code: "reviewer" } })],
        {},
        TENANT,
      );

      expect(result).toEqual([{ principalId: "no-cache-user", ruleId: expect.any(String) }]);
    });
  });

  describe("empty / edge cases", () => {
    it("should return empty for empty rules array", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees([], {}, TENANT);
      expect(result).toEqual([]);
    });

    it("should return empty when all rules have null assign_to", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: null as any })],
        {},
        TENANT,
      );

      expect(result).toEqual([]);
    });

    it("should return empty for role with empty code", async () => {
      const { db } = createMockDb([]);
      const resolver = new ApproverResolverService(db);

      const result = await resolver.resolveAssignees(
        [makeRule({ assign_to: { strategy: "role", role_code: "" } })],
        {},
        TENANT,
      );

      expect(result).toEqual([]);
    });
  });
});
