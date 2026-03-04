import { describe, expect, it } from "vitest";

import {
  evaluateCondition,
  evaluateConditionGroup,
  resolveFieldValue,
  type ConditionGroup,
  type EvaluationContext,
} from "../condition-evaluator.js";

// ============================================================================
// resolveFieldValue
// ============================================================================

describe("resolveFieldValue", () => {
  const ctx: EvaluationContext = {
    name: "Alice",
    age: 30,
    address: { city: "NYC", zip: "10001" },
    tags: ["admin", "user"],
    nested: { deep: { value: 42 } },
  };

  it("resolves top-level fields", () => {
    expect(resolveFieldValue("name", ctx)).toBe("Alice");
    expect(resolveFieldValue("age", ctx)).toBe(30);
  });

  it("resolves nested fields via dot notation", () => {
    expect(resolveFieldValue("address.city", ctx)).toBe("NYC");
    expect(resolveFieldValue("nested.deep.value", ctx)).toBe(42);
  });

  it("returns undefined for missing paths", () => {
    expect(resolveFieldValue("missing", ctx)).toBeUndefined();
    expect(resolveFieldValue("address.nonexistent", ctx)).toBeUndefined();
    expect(resolveFieldValue("name.too.deep", ctx)).toBeUndefined();
  });

  it("handles array values", () => {
    expect(resolveFieldValue("tags", ctx)).toEqual(["admin", "user"]);
  });
});

// ============================================================================
// evaluateCondition
// ============================================================================

describe("evaluateCondition", () => {
  const ctx: EvaluationContext = { amount: 500, name: "test", status: "active" };

  it("eq", () => {
    expect(evaluateCondition({ field: "amount", operator: "eq", value: 500 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "eq", value: 100 }, ctx)).toBe(false);
  });

  it("ne", () => {
    expect(evaluateCondition({ field: "amount", operator: "ne", value: 100 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "ne", value: 500 }, ctx)).toBe(false);
  });

  it("gt / gte / lt / lte", () => {
    expect(evaluateCondition({ field: "amount", operator: "gt", value: 400 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "gt", value: 500 }, ctx)).toBe(false);
    expect(evaluateCondition({ field: "amount", operator: "gte", value: 500 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "lt", value: 600 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "lte", value: 500 }, ctx)).toBe(true);
  });

  it("in / not_in", () => {
    expect(evaluateCondition({ field: "status", operator: "in", value: ["active", "pending"] }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "status", operator: "in", value: ["closed"] }, ctx)).toBe(false);
    expect(evaluateCondition({ field: "status", operator: "not_in", value: ["closed"] }, ctx)).toBe(true);
  });

  it("contains / not_contains / starts_with / ends_with", () => {
    expect(evaluateCondition({ field: "name", operator: "contains", value: "es" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "name", operator: "not_contains", value: "xyz" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "name", operator: "starts_with", value: "te" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "name", operator: "ends_with", value: "st" }, ctx)).toBe(true);
  });

  it("matches (regex)", () => {
    expect(evaluateCondition({ field: "name", operator: "matches", value: "^te.+$" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "name", operator: "matches", value: "^xyz$" }, ctx)).toBe(false);
  });

  it("matches returns false for invalid regex", () => {
    expect(evaluateCondition({ field: "name", operator: "matches", value: "[invalid" }, ctx)).toBe(false);
  });

  it("exists / not_exists", () => {
    expect(evaluateCondition({ field: "name", operator: "exists", value: null }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "missing", operator: "exists", value: null }, ctx)).toBe(false);
    expect(evaluateCondition({ field: "missing", operator: "not_exists", value: null }, ctx)).toBe(true);
  });

  it("between", () => {
    expect(evaluateCondition({ field: "amount", operator: "between", value: [400, 600] }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "between", value: [501, 600] }, ctx)).toBe(false);
    expect(evaluateCondition({ field: "amount", operator: "between", value: "not_array" }, ctx)).toBe(false);
  });

  it("empty / not_empty", () => {
    const ctxEmpty: EvaluationContext = { val: "", arr: [], nul: null };
    expect(evaluateCondition({ field: "val", operator: "empty", value: null }, ctxEmpty)).toBe(true);
    expect(evaluateCondition({ field: "arr", operator: "empty", value: null }, ctxEmpty)).toBe(true);
    expect(evaluateCondition({ field: "nul", operator: "empty", value: null }, ctxEmpty)).toBe(true);
    expect(evaluateCondition({ field: "missing", operator: "empty", value: null }, ctxEmpty)).toBe(true);

    expect(evaluateCondition({ field: "amount", operator: "not_empty", value: null }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "val", operator: "not_empty", value: null }, ctxEmpty)).toBe(false);
  });

  it("date_before / date_after", () => {
    const dateCtx: EvaluationContext = { created: "2024-06-15" };
    expect(evaluateCondition({ field: "created", operator: "date_before", value: "2024-12-31" }, dateCtx)).toBe(true);
    expect(evaluateCondition({ field: "created", operator: "date_after", value: "2024-01-01" }, dateCtx)).toBe(true);
    expect(evaluateCondition({ field: "created", operator: "date_before", value: "2024-01-01" }, dateCtx)).toBe(false);
  });

  it("returns false for unknown operator", () => {
    expect(evaluateCondition({ field: "amount", operator: "unknown" as any, value: 1 }, ctx)).toBe(false);
  });

  it("handles string-to-number coercion for gt/lt", () => {
    const strCtx: EvaluationContext = { amount: "42" };
    expect(evaluateCondition({ field: "amount", operator: "gt", value: 40 }, strCtx)).toBe(true);
  });
});

// ============================================================================
// evaluateConditionGroup
// ============================================================================

describe("evaluateConditionGroup", () => {
  const ctx: EvaluationContext = { amount: 500, status: "active", priority: 3 };

  it("AND group — all must pass", () => {
    const group: ConditionGroup = {
      operator: "and",
      conditions: [
        { field: "amount", operator: "gt", value: 100 },
        { field: "status", operator: "eq", value: "active" },
      ],
    };
    expect(evaluateConditionGroup(group, ctx)).toBe(true);
  });

  it("AND group — fails if any condition fails", () => {
    const group: ConditionGroup = {
      operator: "and",
      conditions: [
        { field: "amount", operator: "gt", value: 100 },
        { field: "status", operator: "eq", value: "closed" },
      ],
    };
    expect(evaluateConditionGroup(group, ctx)).toBe(false);
  });

  it("OR group — passes if any condition passes", () => {
    const group: ConditionGroup = {
      operator: "or",
      conditions: [
        { field: "amount", operator: "gt", value: 1000 },
        { field: "status", operator: "eq", value: "active" },
      ],
    };
    expect(evaluateConditionGroup(group, ctx)).toBe(true);
  });

  it("OR group — fails if all conditions fail", () => {
    const group: ConditionGroup = {
      operator: "or",
      conditions: [
        { field: "amount", operator: "gt", value: 1000 },
        { field: "status", operator: "eq", value: "closed" },
      ],
    };
    expect(evaluateConditionGroup(group, ctx)).toBe(false);
  });

  it("defaults to AND when operator is omitted", () => {
    const group: ConditionGroup = {
      conditions: [
        { field: "amount", operator: "gt", value: 100 },
        { field: "status", operator: "eq", value: "active" },
      ],
    };
    expect(evaluateConditionGroup(group, ctx)).toBe(true);
  });

  it("nested groups", () => {
    const group: ConditionGroup = {
      operator: "and",
      conditions: [
        { field: "priority", operator: "gte", value: 1 },
        {
          operator: "or",
          conditions: [
            { field: "amount", operator: "gt", value: 1000 },
            { field: "status", operator: "eq", value: "active" },
          ],
        },
      ],
    };
    expect(evaluateConditionGroup(group, ctx)).toBe(true);
  });

  it("deeply nested (3 levels)", () => {
    const group: ConditionGroup = {
      operator: "and",
      conditions: [
        {
          operator: "or",
          conditions: [
            {
              operator: "and",
              conditions: [
                { field: "amount", operator: "gt", value: 400 },
                { field: "priority", operator: "lte", value: 5 },
              ],
            },
            { field: "status", operator: "eq", value: "closed" },
          ],
        },
      ],
    };
    expect(evaluateConditionGroup(group, ctx)).toBe(true);
  });

  it("empty conditions array returns true for AND", () => {
    const group: ConditionGroup = { operator: "and", conditions: [] };
    expect(evaluateConditionGroup(group, ctx)).toBe(true);
  });

  it("empty conditions array returns false for OR", () => {
    const group: ConditionGroup = { operator: "or", conditions: [] };
    expect(evaluateConditionGroup(group, ctx)).toBe(false);
  });
});
