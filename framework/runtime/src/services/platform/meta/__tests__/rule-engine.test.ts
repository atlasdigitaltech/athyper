import { describe, expect, it, vi } from "vitest";

import { ValidationEngineService } from "../validation/rule-engine.service.js";

import type {
  ValidationRule,
  RequiredRule,
  MinMaxRule,
  LengthRule,
  RegexRule,
  EnumConstraintRule,
  CrossFieldRule,
  ConditionalRule,
  DateRangeRule,
  ReferentialIntegrityRule,
  UniqueRule,
 RequestContext } from "@athyper/core/meta";

// ============================================================================
// Helpers
// ============================================================================

function makeRule<T extends ValidationRule>(
  partial: Partial<T> & { kind: T["kind"] },
): T {
  return {
    id: `rule-${partial.kind}-1`,
    name: `Test ${partial.kind}`,
    severity: "error",
    appliesOn: ["all"],
    phase: "beforePersist",
    fieldPath: "field",
    ...partial,
  } as T;
}

const ctx: RequestContext = {
  userId: "u1",
  tenantId: "t1",
  realmId: "r1",
  roles: [],
};

// ============================================================================
// Mocks
// ============================================================================

function createMockCompiler(fields: Record<string, unknown>[] = []) {
  return {
    compile: vi.fn().mockResolvedValue({
      entityName: "testEntity",
      tableName: "data.test_entity",
      fields: fields.map((f) => ({
        name: f.name ?? "field",
        type: "text",
        ...f,
      })),
    }),
  };
}

function createMockRegistry() {
  return {
    listEntities: vi.fn().mockResolvedValue([]),
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
    keys: vi.fn(async (pattern: string) => {
      // Simple glob match: replace * with .*
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return [...store.keys()].filter((k) => regex.test(k));
    }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
      }
      return count;
    }),
    _store: store,
  };
}

function createMockDb(queryResult: { cnt: number } = { cnt: 0 }) {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(queryResult),
  };
  return {
    selectFrom: vi.fn().mockReturnValue(mockQuery),
    fn: {
      count: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue("cnt_col") }),
    },
    _mockQuery: mockQuery,
  };
}

function createEngine(
  fields: Record<string, unknown>[] = [],
  dbResult: { cnt: number } = { cnt: 0 },
) {
  const compiler = createMockCompiler(fields);
  const registry = createMockRegistry();
  const redis = createMockRedis();
  const db = createMockDb(dbResult);

  const engine = new ValidationEngineService(
    compiler as any,
    registry as any,
    redis as any,
    db as any,
  );

  return { engine, compiler, registry, redis, db };
}

// ============================================================================
// Tests
// ============================================================================

describe("ValidationEngineService", () => {
  // --------------------------------------------------------------------------
  // Required rule
  // --------------------------------------------------------------------------

  describe("required rule", () => {
    it("fails when value is undefined", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({ kind: "required", fieldPath: "name" });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].ruleId).toBe("rule-required-1");
      expect(result.errors[0].fieldPath).toBe("name");
    });

    it("fails when value is null", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({ kind: "required", fieldPath: "name" });
      const result = await engine.testRules("e1", { name: null }, [rule]);
      expect(result.valid).toBe(false);
    });

    it("fails when value is empty string", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({ kind: "required", fieldPath: "name" });
      const result = await engine.testRules("e1", { name: "" }, [rule]);
      expect(result.valid).toBe(false);
    });

    it("passes when value is present", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({ kind: "required", fieldPath: "name" });
      const result = await engine.testRules("e1", { name: "Alice" }, [rule]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("passes when value is 0 (falsy but present)", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({ kind: "required", fieldPath: "count" });
      const result = await engine.testRules("e1", { count: 0 }, [rule]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // MinMax rule
  // --------------------------------------------------------------------------

  describe("min_max rule", () => {
    it("fails when value is below min", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "amount", min: 10 });
      const result = await engine.testRules("e1", { amount: 5 }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("at least 10");
    });

    it("fails when value is above max", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "amount", max: 100 });
      const result = await engine.testRules("e1", { amount: 150 }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("at most 100");
    });

    it("passes when value is within range", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "amount", min: 10, max: 100 });
      const result = await engine.testRules("e1", { amount: 50 }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("passes at boundary (min=10, value=10)", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "amount", min: 10 });
      const result = await engine.testRules("e1", { amount: 10 }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("skips null values", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "amount", min: 10 });
      const result = await engine.testRules("e1", { amount: null }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("fails for non-numeric values", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "amount", min: 10 });
      const result = await engine.testRules("e1", { amount: "abc" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("must be a number");
    });

    it("coerces string-number values", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "amount", min: 10 });
      const result = await engine.testRules("e1", { amount: "42" }, [rule]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Length rule
  // --------------------------------------------------------------------------

  describe("length rule", () => {
    it("fails when string is too short", async () => {
      const { engine } = createEngine();
      const rule = makeRule<LengthRule>({ kind: "length", fieldPath: "code", minLength: 3 });
      const result = await engine.testRules("e1", { code: "AB" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("at least 3 characters");
    });

    it("fails when string is too long", async () => {
      const { engine } = createEngine();
      const rule = makeRule<LengthRule>({ kind: "length", fieldPath: "code", maxLength: 5 });
      const result = await engine.testRules("e1", { code: "ABCDEF" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("at most 5 characters");
    });

    it("passes when within bounds", async () => {
      const { engine } = createEngine();
      const rule = makeRule<LengthRule>({ kind: "length", fieldPath: "code", minLength: 2, maxLength: 5 });
      const result = await engine.testRules("e1", { code: "ABC" }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("skips null values", async () => {
      const { engine } = createEngine();
      const rule = makeRule<LengthRule>({ kind: "length", fieldPath: "code", minLength: 3 });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Regex rule
  // --------------------------------------------------------------------------

  describe("regex rule", () => {
    it("fails when value does not match pattern", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RegexRule>({ kind: "regex", fieldPath: "email", pattern: "^[\\w.]+@[\\w.]+$" });
      const result = await engine.testRules("e1", { email: "not-an-email" }, [rule]);
      expect(result.valid).toBe(false);
    });

    it("passes when value matches pattern", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RegexRule>({ kind: "regex", fieldPath: "email", pattern: "^[\\w.]+@[\\w.]+$" });
      const result = await engine.testRules("e1", { email: "test@example.com" }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("supports regex flags", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RegexRule>({ kind: "regex", fieldPath: "code", pattern: "^abc$", flags: "i" });
      const result = await engine.testRules("e1", { code: "ABC" }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("handles invalid regex gracefully", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RegexRule>({ kind: "regex", fieldPath: "val", pattern: "[invalid(" });
      const result = await engine.testRules("e1", { val: "test" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Invalid regex");
    });

    it("uses custom message when provided", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RegexRule>({
        kind: "regex",
        fieldPath: "code",
        pattern: "^[A-Z]+$",
        message: "{field} must be uppercase letters only",
      });
      const result = await engine.testRules("e1", { code: "abc" }, [rule]);
      expect(result.errors[0].message).toBe("code must be uppercase letters only");
    });
  });

  // --------------------------------------------------------------------------
  // Enum rule
  // --------------------------------------------------------------------------

  describe("enum rule", () => {
    it("fails when value is not in allowed list", async () => {
      const { engine } = createEngine();
      const rule = makeRule<EnumConstraintRule>({
        kind: "enum",
        fieldPath: "status",
        allowedValues: ["active", "inactive"],
      });
      const result = await engine.testRules("e1", { status: "deleted" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("must be one of");
    });

    it("passes when value is in allowed list", async () => {
      const { engine } = createEngine();
      const rule = makeRule<EnumConstraintRule>({
        kind: "enum",
        fieldPath: "status",
        allowedValues: ["active", "inactive"],
      });
      const result = await engine.testRules("e1", { status: "active" }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("skips null values", async () => {
      const { engine } = createEngine();
      const rule = makeRule<EnumConstraintRule>({
        kind: "enum",
        fieldPath: "status",
        allowedValues: ["active"],
      });
      const result = await engine.testRules("e1", { status: null }, [rule]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // CrossField rule
  // --------------------------------------------------------------------------

  describe("cross_field rule", () => {
    it("fails when cross-field comparison fails", async () => {
      const { engine } = createEngine();
      const rule = makeRule<CrossFieldRule>({
        kind: "cross_field",
        fieldPath: "endDate",
        compareField: "startDate",
        operator: "gt",
      });
      const result = await engine.testRules(
        "e1",
        { startDate: "2024-06-01", endDate: "2024-01-01" },
        [rule],
      );
      expect(result.valid).toBe(false);
    });

    it("passes when cross-field comparison succeeds", async () => {
      const { engine } = createEngine();
      const rule = makeRule<CrossFieldRule>({
        kind: "cross_field",
        fieldPath: "max",
        compareField: "min",
        operator: "gt",
      });
      const result = await engine.testRules("e1", { min: 10, max: 20 }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("skips when either value is null", async () => {
      const { engine } = createEngine();
      const rule = makeRule<CrossFieldRule>({
        kind: "cross_field",
        fieldPath: "endDate",
        compareField: "startDate",
        operator: "gt",
      });
      const result = await engine.testRules("e1", { endDate: "2024-06-01" }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("uses custom message", async () => {
      const { engine } = createEngine();
      const rule = makeRule<CrossFieldRule>({
        kind: "cross_field",
        fieldPath: "max",
        compareField: "min",
        operator: "gt",
        message: "Maximum must exceed minimum",
      });
      const result = await engine.testRules("e1", { min: 20, max: 10 }, [rule]);
      expect(result.errors[0].message).toBe("Maximum must exceed minimum");
    });
  });

  // --------------------------------------------------------------------------
  // Conditional rule
  // --------------------------------------------------------------------------

  describe("conditional rule", () => {
    it("enforces nested rules when condition is met", async () => {
      const { engine } = createEngine();
      const rule = makeRule<ConditionalRule>({
        kind: "conditional",
        fieldPath: "status",
        when: {
          operator: "and",
          conditions: [{ field: "status", operator: "eq", value: "active" }],
        },
        then: [
          makeRule<RequiredRule>({ kind: "required", fieldPath: "assignee" }),
        ],
      });
      const result = await engine.testRules(
        "e1",
        { status: "active" },
        [rule],
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].fieldPath).toBe("assignee");
    });

    it("skips nested rules when condition is not met", async () => {
      const { engine } = createEngine();
      const rule = makeRule<ConditionalRule>({
        kind: "conditional",
        fieldPath: "status",
        when: {
          operator: "and",
          conditions: [{ field: "status", operator: "eq", value: "active" }],
        },
        then: [
          makeRule<RequiredRule>({ kind: "required", fieldPath: "assignee" }),
        ],
      });
      const result = await engine.testRules(
        "e1",
        { status: "draft" },
        [rule],
      );
      expect(result.valid).toBe(true);
    });

    it("overrides nested rule severity with parent error severity", async () => {
      const { engine } = createEngine();
      const rule = makeRule<ConditionalRule>({
        kind: "conditional",
        fieldPath: "type",
        severity: "error",
        when: {
          conditions: [{ field: "type", operator: "eq", value: "premium" }],
        },
        then: [
          makeRule<RequiredRule>({
            kind: "required",
            fieldPath: "creditLimit",
            severity: "warning",
          }),
        ],
      });
      const result = await engine.testRules(
        "e1",
        { type: "premium" },
        [rule],
      );
      // Parent severity "error" overrides child "warning"
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // DateRange rule
  // --------------------------------------------------------------------------

  describe("date_range rule", () => {
    it("fails when date is before minDate", async () => {
      const { engine } = createEngine();
      const rule = makeRule<DateRangeRule>({
        kind: "date_range",
        fieldPath: "startDate",
        minDate: "2024-01-01",
      });
      const result = await engine.testRules("e1", { startDate: "2023-06-15" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("on or after");
    });

    it("fails when date is after maxDate", async () => {
      const { engine } = createEngine();
      const rule = makeRule<DateRangeRule>({
        kind: "date_range",
        fieldPath: "endDate",
        maxDate: "2025-12-31",
      });
      const result = await engine.testRules("e1", { endDate: "2026-06-01" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("on or before");
    });

    it("fails when date is not after afterField", async () => {
      const { engine } = createEngine();
      const rule = makeRule<DateRangeRule>({
        kind: "date_range",
        fieldPath: "endDate",
        afterField: "startDate",
      });
      const result = await engine.testRules(
        "e1",
        { startDate: "2024-06-01", endDate: "2024-01-01" },
        [rule],
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("must be after");
    });

    it("fails when date is not before beforeField", async () => {
      const { engine } = createEngine();
      const rule = makeRule<DateRangeRule>({
        kind: "date_range",
        fieldPath: "startDate",
        beforeField: "endDate",
      });
      const result = await engine.testRules(
        "e1",
        { startDate: "2024-12-01", endDate: "2024-06-01" },
        [rule],
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("must be before");
    });

    it("passes when date is within range", async () => {
      const { engine } = createEngine();
      const rule = makeRule<DateRangeRule>({
        kind: "date_range",
        fieldPath: "eventDate",
        minDate: "2024-01-01",
        maxDate: "2025-12-31",
      });
      const result = await engine.testRules("e1", { eventDate: "2024-06-15" }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("fails for invalid date values", async () => {
      const { engine } = createEngine();
      const rule = makeRule<DateRangeRule>({
        kind: "date_range",
        fieldPath: "date",
        minDate: "2024-01-01",
      });
      const result = await engine.testRules("e1", { date: "not-a-date" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("valid date");
    });

    it("skips null values", async () => {
      const { engine } = createEngine();
      const rule = makeRule<DateRangeRule>({
        kind: "date_range",
        fieldPath: "date",
        minDate: "2024-01-01",
      });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Referential integrity rule
  // --------------------------------------------------------------------------

  describe("referential rule", () => {
    it("fails when referenced record does not exist", async () => {
      const { engine } = createEngine([], { cnt: 0 });
      const rule = makeRule<ReferentialIntegrityRule>({
        kind: "referential",
        fieldPath: "categoryId",
        targetEntity: "Category",
      });
      const result = await engine.testRules("e1", { categoryId: "cat-999" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("non-existent");
    });

    it("passes when referenced record exists", async () => {
      const { engine } = createEngine([], { cnt: 1 });
      const rule = makeRule<ReferentialIntegrityRule>({
        kind: "referential",
        fieldPath: "categoryId",
        targetEntity: "Category",
      });
      const result = await engine.testRules("e1", { categoryId: "cat-1" }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("skips null values", async () => {
      const { engine } = createEngine([], { cnt: 0 });
      const rule = makeRule<ReferentialIntegrityRule>({
        kind: "referential",
        fieldPath: "categoryId",
        targetEntity: "Category",
      });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Unique rule
  // --------------------------------------------------------------------------

  describe("unique rule", () => {
    it("fails when duplicate exists", async () => {
      const { engine } = createEngine([], { cnt: 1 });
      const rule = makeRule<UniqueRule>({
        kind: "unique",
        fieldPath: "email",
      });
      const result = await engine.testRules("e1", { email: "dup@test.com" }, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("must be unique");
    });

    it("passes when no duplicate exists", async () => {
      const { engine } = createEngine([], { cnt: 0 });
      const rule = makeRule<UniqueRule>({
        kind: "unique",
        fieldPath: "email",
      });
      const result = await engine.testRules("e1", { email: "unique@test.com" }, [rule]);
      expect(result.valid).toBe(true);
    });

    it("skips null values", async () => {
      const { engine } = createEngine([], { cnt: 0 });
      const rule = makeRule<UniqueRule>({
        kind: "unique",
        fieldPath: "email",
      });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Trigger & Phase Filtering
  // --------------------------------------------------------------------------

  describe("trigger and phase filtering", () => {
    it("only runs rules matching the trigger", async () => {
      const { engine } = createEngine();
      const createRule = makeRule<RequiredRule>({
        kind: "required",
        id: "r-create",
        fieldPath: "name",
        appliesOn: ["create"],
      });
      const updateRule = makeRule<RequiredRule>({
        kind: "required",
        id: "r-update",
        fieldPath: "updatedBy",
        appliesOn: ["update"],
      });

      // On "create" trigger, only createRule should fire
      const result = await engine.testRules("e1", {}, [createRule, updateRule], "create");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].ruleId).toBe("r-create");
    });

    it("runs rules with 'all' trigger on any operation", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "name",
        appliesOn: ["all"],
      });

      const r1 = await engine.testRules("e1", {}, [rule], "create");
      expect(r1.errors).toHaveLength(1);

      const r2 = await engine.testRules("e1", {}, [rule], "update");
      expect(r2.errors).toHaveLength(1);
    });

    it("skips rules that don't match the phase", async () => {
      const { engine } = createEngine();
      // testRules uses "beforePersist" phase
      const transitionRule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "name",
        phase: "beforeTransition",
      });
      const result = await engine.testRules("e1", {}, [transitionRule]);
      // Rule should be filtered out (wrong phase)
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Severity: errors vs warnings
  // --------------------------------------------------------------------------

  describe("severity", () => {
    it("error rules make result invalid", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "name",
        severity: "error",
      });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    });

    it("warning rules keep result valid", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "name",
        severity: "warning",
      });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
    });

    it("mixed errors + warnings: invalid if any error", async () => {
      const { engine } = createEngine();
      const errorRule = makeRule<RequiredRule>({
        kind: "required",
        id: "r-error",
        fieldPath: "name",
        severity: "error",
      });
      const warningRule = makeRule<RequiredRule>({
        kind: "required",
        id: "r-warn",
        fieldPath: "description",
        severity: "warning",
      });
      const result = await engine.testRules("e1", {}, [errorRule, warningRule]);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Custom error messages with template variables
  // --------------------------------------------------------------------------

  describe("custom error messages", () => {
    it("replaces {field} and {value} placeholders", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({
        kind: "min_max",
        fieldPath: "age",
        min: 18,
        message: "{field} value {value} is below minimum age",
      });
      const result = await engine.testRules("e1", { age: 12 }, [rule]);
      expect(result.errors[0].message).toBe("age value 12 is below minimum age");
    });

    it("uses default message when no custom message", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "title",
      });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.errors[0].message).toBe("title is required");
    });
  });

  // --------------------------------------------------------------------------
  // Nested field paths (dot notation)
  // --------------------------------------------------------------------------

  describe("nested field paths", () => {
    it("validates nested fields via dot notation", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "address.city",
      });
      const result = await engine.testRules("e1", { address: {} }, [rule]);
      expect(result.valid).toBe(false);
    });

    it("passes for present nested fields", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "address.city",
      });
      const result = await engine.testRules(
        "e1",
        { address: { city: "NYC" } },
        [rule],
      );
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Multiple rules
  // --------------------------------------------------------------------------

  describe("multiple rules", () => {
    it("collects all failures", async () => {
      const { engine } = createEngine();
      const rules: ValidationRule[] = [
        makeRule<RequiredRule>({ kind: "required", id: "r1", fieldPath: "name" }),
        makeRule<RequiredRule>({ kind: "required", id: "r2", fieldPath: "email" }),
        makeRule<MinMaxRule>({ kind: "min_max", id: "r3", fieldPath: "age", min: 18, severity: "warning" }),
      ];
      const result = await engine.testRules("e1", { age: 10 }, rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);   // name + email required
      expect(result.warnings).toHaveLength(1);  // age below min
    });

    it("returns valid when all rules pass", async () => {
      const { engine } = createEngine();
      const rules: ValidationRule[] = [
        makeRule<RequiredRule>({ kind: "required", id: "r1", fieldPath: "name" }),
        makeRule<LengthRule>({ kind: "length", id: "r2", fieldPath: "name", minLength: 2, maxLength: 50 }),
      ];
      const result = await engine.testRules("e1", { name: "Alice" }, rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Unknown rule kind
  // --------------------------------------------------------------------------

  describe("unknown rule kind", () => {
    it("ignores unknown rule kinds", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({
        kind: "unknown_kind" as any,
        fieldPath: "field",
      });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Caching (L1 + L2)
  // --------------------------------------------------------------------------

  describe("caching", () => {
    it("caches compiled rules in L1 (in-memory)", async () => {
      const fields = [
        { name: "name", validationRules: { version: 1, rules: [makeRule<RequiredRule>({ kind: "required", fieldPath: "name" })] } },
      ];
      const { engine, compiler } = createEngine(fields);

      // First call compiles
      await engine.compileRules("entity1", "v1");
      expect(compiler.compile).toHaveBeenCalledTimes(1);

      // Second call hits L1 cache
      await engine.compileRules("entity1", "v1");
      expect(compiler.compile).toHaveBeenCalledTimes(1);
    });

    it("falls back to L2 (Redis) when L1 misses", async () => {
      const fields = [
        { name: "name", validationRules: { version: 1, rules: [] } },
      ];
      const { engine, compiler, redis } = createEngine(fields);

      // Pre-populate L2
      const graph = {
        entityName: "entity1",
        version: "v1",
        rules: [],
        compiledAt: new Date(),
      };
      redis._store.set("meta:vrules:entity1:v1", JSON.stringify(graph));

      // Should hit L2 and not compile
      const result = await engine.compileRules("entity1", "v1");
      expect(compiler.compile).not.toHaveBeenCalled();
      expect(result.entityName).toBe("entity1");
    });

    it("invalidateRuleCache clears L1 and attempts L2 clear", async () => {
      const fields = [
        { name: "name", validationRules: { version: 1, rules: [] } },
      ];
      const { engine, compiler } = createEngine(fields);

      // Populate cache
      await engine.compileRules("entity1", "v1");
      expect(compiler.compile).toHaveBeenCalledTimes(1);

      // Invalidate
      await engine.invalidateRuleCache("entity1");

      // Next call must re-compile
      await engine.compileRules("entity1", "v1");
      expect(compiler.compile).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // Rule extraction from compiled model
  // --------------------------------------------------------------------------

  describe("rule extraction from model", () => {
    it("extracts rules from field validationRules", async () => {
      const requiredRule = makeRule<RequiredRule>({ kind: "required", fieldPath: "name" });
      const fields = [
        {
          name: "name",
          validationRules: { version: 1, rules: [requiredRule] },
        },
      ];
      const { engine } = createEngine(fields);

      const graph = await engine.compileRules("testEntity", "v1");
      expect(graph.rules).toHaveLength(1);
      expect(graph.rules[0].kind).toBe("required");
    });

    it("returns empty rules when no validationRules on fields", async () => {
      const fields = [{ name: "name" }];
      const { engine } = createEngine(fields);

      const graph = await engine.compileRules("testEntity", "v1");
      expect(graph.rules).toHaveLength(0);
    });

    it("concatenates rules from multiple fields", async () => {
      const fields = [
        {
          name: "name",
          validationRules: {
            version: 1,
            rules: [makeRule<RequiredRule>({ kind: "required", id: "r1", fieldPath: "name" })],
          },
        },
        {
          name: "email",
          validationRules: {
            version: 1,
            rules: [makeRule<RegexRule>({ kind: "regex", id: "r2", fieldPath: "email", pattern: "@" })],
          },
        },
      ];
      const { engine } = createEngine(fields);

      const graph = await engine.compileRules("testEntity", "v1");
      expect(graph.rules).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // validate() integration
  // --------------------------------------------------------------------------

  describe("validate() method", () => {
    it("compiles rules from model and validates", async () => {
      const fields = [
        {
          name: "name",
          validationRules: {
            version: 1,
            rules: [makeRule<RequiredRule>({ kind: "required", fieldPath: "name" })],
          },
        },
      ];
      const { engine } = createEngine(fields);

      const result = await engine.validate("testEntity", {}, "create", ctx);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it("passes existing record for update comparisons", async () => {
      const fields = [
        {
          name: "amount",
          validationRules: {
            version: 1,
            rules: [makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "amount", min: 0 })],
          },
        },
      ];
      const { engine } = createEngine(fields);

      const result = await engine.validate(
        "testEntity",
        { amount: 50 },
        "update",
        ctx,
        { amount: 30 },
      );
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // validateForTransition()
  // --------------------------------------------------------------------------

  describe("validateForTransition()", () => {
    it("uses beforeTransition phase and transition trigger", async () => {
      const transitionRule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "approver",
        phase: "beforeTransition",
        appliesOn: ["transition"],
      });
      const persistRule = makeRule<RequiredRule>({
        kind: "required",
        fieldPath: "name",
        phase: "beforePersist",
        appliesOn: ["create"],
      });
      const fields = [
        {
          name: "approver",
          validationRules: { version: 1, rules: [transitionRule, persistRule] },
        },
      ];
      const { engine } = createEngine(fields);

      const result = await engine.validateForTransition("testEntity", {}, ctx);
      // Only the transition rule should fire
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fieldPath).toBe("approver");
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe("edge cases", () => {
    it("empty rules array returns valid", async () => {
      const { engine } = createEngine();
      const result = await engine.testRules("e1", { anything: "value" }, []);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("empty payload with no required rules returns valid", async () => {
      const { engine } = createEngine();
      const rule = makeRule<MinMaxRule>({ kind: "min_max", fieldPath: "age", min: 0 });
      const result = await engine.testRules("e1", {}, [rule]);
      expect(result.valid).toBe(true);
    });

    it("RuleValidationError includes rule metadata", async () => {
      const { engine } = createEngine();
      const rule = makeRule<RequiredRule>({
        kind: "required",
        id: "req-name-001",
        name: "Name Required",
        fieldPath: "name",
        severity: "error",
      });
      const result = await engine.testRules("e1", {}, [rule]);
      const err = result.errors[0];
      expect(err.ruleId).toBe("req-name-001");
      expect(err.ruleName).toBe("Name Required");
      expect(err.fieldPath).toBe("name");
      expect(err.severity).toBe("error");
    });
  });
});
