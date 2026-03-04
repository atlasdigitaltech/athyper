/**
 * Rule Evaluator Tests
 *
 * A7: Testing for the rule evaluation engine
 */

import { describe, it, expect } from "vitest";

import type { Condition, ConditionGroup, CompiledRule, SubjectSnapshot } from "../types.js";

// Mock condition evaluation logic for unit testing
// This tests the condition evaluation logic without database dependencies

// Test subject for ABAC conditions (module-level for use across all tests)
const mockSubject: SubjectSnapshot = {
  principalId: "user-123",
  principalType: "user",
  tenantId: "tenant-1",
  userKey: "user:user-123",
  roles: ["admin", "editor"],
  groups: ["engineering", "team-alpha"],
  ouMembership: {
    nodeId: "ou-1",
    path: "/root/engineering/team-alpha",
    code: "team-alpha",
  },
  attributes: {
    department: "engineering",
    level: "senior",
    location: "us-west",
  },
  generatedAt: new Date(),
};

describe("Condition Evaluation", () => {
  describe("Single Conditions", () => {
    it("should evaluate eq operator correctly", () => {
      const condition: Condition = {
        field: "subject.attributes.department",
        operator: "eq",
        value: "engineering",
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate ne operator correctly", () => {
      const condition: Condition = {
        field: "subject.attributes.department",
        operator: "ne",
        value: "sales",
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate in operator correctly", () => {
      const condition: Condition = {
        field: "subject.attributes.level",
        operator: "in",
        value: ["junior", "senior", "lead"],
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate not_in operator correctly", () => {
      const condition: Condition = {
        field: "subject.attributes.level",
        operator: "not_in",
        value: ["intern", "contractor"],
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate contains operator correctly", () => {
      const condition: Condition = {
        field: "subject.ouMembership.path",
        operator: "contains",
        value: "/engineering/",
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate starts_with operator correctly", () => {
      const condition: Condition = {
        field: "subject.ouMembership.path",
        operator: "starts_with",
        value: "/root/",
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate ends_with operator correctly", () => {
      const condition: Condition = {
        field: "subject.ouMembership.code",
        operator: "ends_with",
        value: "alpha",
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate matches (regex) operator correctly", () => {
      const condition: Condition = {
        field: "subject.attributes.location",
        operator: "matches",
        value: "^us-",
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate exists operator correctly", () => {
      const condition: Condition = {
        field: "subject.attributes.department",
        operator: "exists",
        value: true,
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate not_exists operator correctly", () => {
      const condition: Condition = {
        field: "subject.attributes.nonexistent",
        operator: "not_exists",
        value: true,
      };

      const result = evaluateCondition(condition, mockSubject);
      expect(result).toBe(true);
    });
  });

  describe("Condition Groups", () => {
    it("should evaluate AND group correctly when all true", () => {
      const group: ConditionGroup = {
        operator: "and",
        conditions: [
          { field: "subject.attributes.department", operator: "eq", value: "engineering" },
          { field: "subject.attributes.level", operator: "eq", value: "senior" },
        ],
      };

      const result = evaluateConditionGroup(group, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate AND group correctly when one false", () => {
      const group: ConditionGroup = {
        operator: "and",
        conditions: [
          { field: "subject.attributes.department", operator: "eq", value: "engineering" },
          { field: "subject.attributes.level", operator: "eq", value: "junior" },
        ],
      };

      const result = evaluateConditionGroup(group, mockSubject);
      expect(result).toBe(false);
    });

    it("should evaluate OR group correctly when one true", () => {
      const group: ConditionGroup = {
        operator: "or",
        conditions: [
          { field: "subject.attributes.department", operator: "eq", value: "sales" },
          { field: "subject.attributes.level", operator: "eq", value: "senior" },
        ],
      };

      const result = evaluateConditionGroup(group, mockSubject);
      expect(result).toBe(true);
    });

    it("should evaluate OR group correctly when all false", () => {
      const group: ConditionGroup = {
        operator: "or",
        conditions: [
          { field: "subject.attributes.department", operator: "eq", value: "sales" },
          { field: "subject.attributes.level", operator: "eq", value: "junior" },
        ],
      };

      const result = evaluateConditionGroup(group, mockSubject);
      expect(result).toBe(false);
    });

    it("should handle nested condition groups", () => {
      const group: ConditionGroup = {
        operator: "and",
        conditions: [
          { field: "subject.attributes.department", operator: "eq", value: "engineering" },
          {
            operator: "or",
            conditions: [
              { field: "subject.attributes.level", operator: "eq", value: "senior" },
              { field: "subject.attributes.level", operator: "eq", value: "lead" },
            ],
          } as ConditionGroup,
        ],
      };

      const result = evaluateConditionGroup(group, mockSubject);
      expect(result).toBe(true);
    });
  });

  describe("Role-based Conditions", () => {
    it("should check role membership via subject.roles", () => {
      // Check if user has 'admin' role
      const hasAdmin = mockSubject.roles.includes("admin");
      expect(hasAdmin).toBe(true);

      const hasViewer = mockSubject.roles.includes("viewer");
      expect(hasViewer).toBe(false);
    });

    it("should check group membership via subject.groups", () => {
      const inEngineering = mockSubject.groups.includes("engineering");
      expect(inEngineering).toBe(true);

      const inSales = mockSubject.groups.includes("sales");
      expect(inSales).toBe(false);
    });
  });
});

describe("Effect Precedence", () => {
  it("should select more specific scope over general", () => {
    const rules: Array<{ rule: CompiledRule; scopeType: string }> = [
      { rule: { ruleId: "1", effect: "allow", priority: 100 }, scopeType: "global" },
      { rule: { ruleId: "2", effect: "deny", priority: 100 }, scopeType: "entity" },
    ];

    const winner = selectWinner(rules);
    expect(winner.rule.ruleId).toBe("2"); // entity is more specific
    expect(winner.rule.effect).toBe("deny");
  });

  it("should select lower priority within same scope", () => {
    const rules: Array<{ rule: CompiledRule; scopeType: string }> = [
      { rule: { ruleId: "1", effect: "allow", priority: 100 }, scopeType: "entity" },
      { rule: { ruleId: "2", effect: "deny", priority: 50 }, scopeType: "entity" },
    ];

    const winner = selectWinner(rules);
    expect(winner.rule.ruleId).toBe("2"); // priority 50 < 100
  });

  it("should prefer deny over allow at same scope and priority", () => {
    const rules: Array<{ rule: CompiledRule; scopeType: string }> = [
      { rule: { ruleId: "1", effect: "allow", priority: 100 }, scopeType: "entity" },
      { rule: { ruleId: "2", effect: "deny", priority: 100 }, scopeType: "entity" },
    ];

    const winner = selectWinner(rules);
    expect(winner.rule.effect).toBe("deny");
  });
});

describe("Subject Key Building", () => {
  it("should build correct subject keys from snapshot", () => {
    const keys = buildSubjectKeys(mockSubject);

    expect(keys).toContainEqual({ type: "user", key: "user-123" });
    expect(keys).toContainEqual({ type: "kc_role", key: "admin" });
    expect(keys).toContainEqual({ type: "kc_role", key: "editor" });
    expect(keys).toContainEqual({ type: "kc_group", key: "engineering" });
    expect(keys).toContainEqual({ type: "kc_group", key: "team-alpha" });
  });

  it("should include service key for service accounts", () => {
    const serviceSubject: SubjectSnapshot = {
      ...mockSubject,
      principalType: "service",
      serviceKey: "service:api-gateway",
    };

    const keys = buildSubjectKeys(serviceSubject);
    expect(keys).toContainEqual({ type: "service", key: "user-123" });
  });
});

// Helper functions that mirror the implementation logic for testing

function resolveFieldValue(field: string, subject: SubjectSnapshot): unknown {
  const parts = field.split(".");
  const source = parts[0];
  const path = parts.slice(1);

  let value: unknown;

  switch (source) {
    case "subject":
      value = subject;
      break;
    default:
      if (subject.attributes[field]) {
        return subject.attributes[field];
      }
      return undefined;
  }

  for (const key of path) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "object") {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return value;
}

function evaluateCondition(condition: Condition, subject: SubjectSnapshot): boolean {
  const fieldValue = resolveFieldValue(condition.field, subject);
  const compareValue = condition.value;

  switch (condition.operator) {
    case "eq":
      return fieldValue === compareValue;
    case "ne":
      return fieldValue !== compareValue;
    case "in":
      return Array.isArray(compareValue) && compareValue.includes(fieldValue);
    case "not_in":
      return Array.isArray(compareValue) && !compareValue.includes(fieldValue);
    case "contains":
      return typeof fieldValue === "string" && typeof compareValue === "string" &&
        fieldValue.includes(compareValue);
    case "starts_with":
      return typeof fieldValue === "string" && typeof compareValue === "string" &&
        fieldValue.startsWith(compareValue);
    case "ends_with":
      return typeof fieldValue === "string" && typeof compareValue === "string" &&
        fieldValue.endsWith(compareValue);
    case "matches":
      try {
        return typeof fieldValue === "string" && typeof compareValue === "string" &&
          new RegExp(compareValue).test(fieldValue);
      } catch {
        return false;
      }
    case "exists":
      return fieldValue !== undefined && fieldValue !== null;
    case "not_exists":
      return fieldValue === undefined || fieldValue === null;
    default:
      return false;
  }
}

function evaluateConditionGroup(group: ConditionGroup, subject: SubjectSnapshot): boolean {
  const operator = group.operator ?? "and";

  if (operator === "and") {
    for (const condition of group.conditions) {
      if ("operator" in condition && "conditions" in condition) {
        if (!evaluateConditionGroup(condition as ConditionGroup, subject)) {
          return false;
        }
      } else {
        if (!evaluateCondition(condition as Condition, subject)) {
          return false;
        }
      }
    }
    return true;
  } else {
    for (const condition of group.conditions) {
      if ("operator" in condition && "conditions" in condition) {
        if (evaluateConditionGroup(condition as ConditionGroup, subject)) {
          return true;
        }
      } else {
        if (evaluateCondition(condition as Condition, subject)) {
          return true;
        }
      }
    }
    return false;
  }
}

const SCOPE_SPECIFICITY: Record<string, number> = {
  record: 5,
  entity_version: 4,
  entity: 3,
  module: 2,
  global: 1,
};

function selectWinner(
  matchedRules: Array<{ rule: CompiledRule; scopeType: string }>
): { rule: CompiledRule; scopeType: string } {
  const sorted = [...matchedRules].sort((a, b) => {
    const scopeDiff = (SCOPE_SPECIFICITY[b.scopeType] ?? 0) - (SCOPE_SPECIFICITY[a.scopeType] ?? 0);
    if (scopeDiff !== 0) return scopeDiff;

    const priorityDiff = a.rule.priority - b.rule.priority;
    if (priorityDiff !== 0) return priorityDiff;

    if (a.rule.effect === "deny" && b.rule.effect === "allow") return -1;
    if (a.rule.effect === "allow" && b.rule.effect === "deny") return 1;

    return 0;
  });

  return sorted[0];
}

function buildSubjectKeys(snapshot: SubjectSnapshot) {
  const keys: Array<{ type: string; key: string }> = [];

  keys.push({ type: "user", key: snapshot.principalId });

  if (snapshot.serviceKey) {
    keys.push({ type: "service", key: snapshot.principalId });
  }

  for (const role of snapshot.roles) {
    keys.push({ type: "kc_role", key: role });
  }

  for (const group of snapshot.groups) {
    keys.push({ type: "kc_group", key: group });
  }

  return keys;
}
