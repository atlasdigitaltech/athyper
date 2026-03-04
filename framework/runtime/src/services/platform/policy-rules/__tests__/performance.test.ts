/**
 * Policy Gate Performance Tests
 *
 * A7: Performance benchmarks
 * Target: p95 < 50ms for policy evaluation
 */

import { describe, it, expect } from "vitest";

import type {
  CompiledPolicy,
  CompiledRule,
  SubjectSnapshot,
  ConditionGroup,
} from "../types.js";

// Mock compiled policy for performance testing
function createMockCompiledPolicy(ruleCount: number): CompiledPolicy {
  const ruleIndex: CompiledPolicy["ruleIndex"] = {};

  // Create rules spread across different scopes and subjects
  const scopes = ["global:*", "module:crm", "entity:users", "entity:orders"];
  const subjects = ["kc_role:admin", "kc_role:editor", "kc_group:engineering", "user:*"];
  const operations = ["op-read", "op-create", "op-update", "op-delete"];

  let ruleId = 0;

  for (let i = 0; i < ruleCount; i++) {
    const scope = scopes[i % scopes.length];
    const subject = subjects[Math.floor(i / scopes.length) % subjects.length];
    const operation = operations[i % operations.length];

    if (!ruleIndex[scope]) {
      ruleIndex[scope] = {};
    }
    if (!ruleIndex[scope][subject]) {
      ruleIndex[scope][subject] = {};
    }
    if (!ruleIndex[scope][subject][operation]) {
      ruleIndex[scope][subject][operation] = [];
    }

    const rule: CompiledRule = {
      ruleId: `rule-${ruleId++}`,
      effect: i % 3 === 0 ? "deny" : "allow",
      priority: 100 + (i % 10),
      conditions: i % 5 === 0 ? createMockConditions() : undefined,
    };

    ruleIndex[scope][subject][operation].push(rule);
  }

  return {
    policyVersionId: "v1",
    policyId: "policy-1",
    tenantId: "tenant-1",
    scopeType: "global",
    scopeKey: null,
    compiledAt: new Date(),
    hash: "test-hash",
    ruleIndex,
  };
}

function createMockConditions(): ConditionGroup {
  return {
    operator: "and",
    conditions: [
      { field: "subject.attributes.department", operator: "eq", value: "engineering" },
      { field: "subject.attributes.level", operator: "in", value: ["senior", "lead"] },
    ],
  };
}

function createMockSubject(): SubjectSnapshot {
  return {
    principalId: "user-123",
    principalType: "user",
    tenantId: "tenant-1",
    userKey: "user:user-123",
    roles: ["admin", "editor", "viewer"],
    groups: ["engineering", "team-alpha", "platform"],
    attributes: {
      department: "engineering",
      level: "senior",
      location: "us-west",
    },
    generatedAt: new Date(),
  };
}

// Simplified rule matching logic for benchmarking
function findMatchingRules(
  compiled: CompiledPolicy,
  subjectKeys: Array<{ type: string; key: string }>,
  operationId: string,
  scopeKey: string
): CompiledRule[] {
  const matchedRules: CompiledRule[] = [];

  const scopeIndex = compiled.ruleIndex[scopeKey];
  if (!scopeIndex) return matchedRules;

  for (const subjectKey of subjectKeys) {
    const fullSubjectKey = `${subjectKey.type}:${subjectKey.key}`;
    const subjectIndex = scopeIndex[fullSubjectKey];
    if (!subjectIndex) continue;

    const rules = subjectIndex[operationId];
    if (rules) {
      matchedRules.push(...rules);
    }
  }

  // Check wildcard
  const wildcardIndex = scopeIndex["*"];
  if (wildcardIndex) {
    const rules = wildcardIndex[operationId];
    if (rules) {
      matchedRules.push(...rules);
    }
  }

  return matchedRules;
}

function buildSubjectKeys(snapshot: SubjectSnapshot) {
  const keys: Array<{ type: string; key: string }> = [];

  keys.push({ type: "user", key: snapshot.principalId });

  for (const role of snapshot.roles) {
    keys.push({ type: "kc_role", key: role });
  }

  for (const group of snapshot.groups) {
    keys.push({ type: "kc_group", key: group });
  }

  return keys;
}

describe("Policy Gate Performance", () => {
  describe("Rule Matching Performance", () => {
    it("should match rules in < 1ms for 100 rules", () => {
      const policy = createMockCompiledPolicy(100);
      const subject = createMockSubject();
      const subjectKeys = buildSubjectKeys(subject);

      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        findMatchingRules(policy, subjectKeys, "op-read", "entity:users");
        const end = performance.now();
        times.push(end - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      console.log(`Rule matching (100 rules): avg=${avg.toFixed(3)}ms, p95=${p95.toFixed(3)}ms, p99=${p99.toFixed(3)}ms`);

      expect(p95).toBeLessThan(1); // p95 < 1ms
    });

    it("should match rules in < 5ms for 1000 rules", () => {
      const policy = createMockCompiledPolicy(1000);
      const subject = createMockSubject();
      const subjectKeys = buildSubjectKeys(subject);

      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        findMatchingRules(policy, subjectKeys, "op-read", "entity:users");
        const end = performance.now();
        times.push(end - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];

      console.log(`Rule matching (1000 rules): avg=${avg.toFixed(3)}ms, p95=${p95.toFixed(3)}ms`);

      expect(p95).toBeLessThan(5);
    });
  });

  describe("Subject Key Building Performance", () => {
    it("should build subject keys in < 0.1ms", () => {
      const subject = createMockSubject();
      const iterations = 10000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        buildSubjectKeys(subject);
        const end = performance.now();
        times.push(end - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];

      console.log(`Subject key building: avg=${avg.toFixed(4)}ms, p95=${p95.toFixed(4)}ms`);

      expect(p95).toBeLessThan(0.1);
    });
  });

  describe("Condition Evaluation Performance", () => {
    const conditions = createMockConditions();
    const subject = createMockSubject();

    it("should evaluate conditions in < 0.5ms", () => {
      const iterations = 10000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        evaluateConditionGroup(conditions, subject);
        const end = performance.now();
        times.push(end - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];

      console.log(`Condition evaluation: avg=${avg.toFixed(4)}ms, p95=${p95.toFixed(4)}ms`);

      expect(p95).toBeLessThan(0.5);
    });
  });

  describe("Full Authorization Flow Simulation", () => {
    it("should complete full authorization in < 50ms (target p95)", () => {
      const policy = createMockCompiledPolicy(500);
      const subject = createMockSubject();
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        // Simulate full flow
        // 1. Build subject keys
        const subjectKeys = buildSubjectKeys(subject);

        // 2. Match rules across multiple scopes
        const scopes = ["global:*", "module:crm", "entity:users"];
        const allRules: CompiledRule[] = [];
        for (const scope of scopes) {
          const rules = findMatchingRules(policy, subjectKeys, "op-read", scope);
          allRules.push(...rules);
        }

        // 3. Evaluate conditions on matched rules
        for (const rule of allRules) {
          if (rule.conditions) {
            evaluateConditionGroup(rule.conditions, subject);
          }
        }

        // 4. Select winner
        if (allRules.length > 0) {
          allRules.sort((a, b) => a.priority - b.priority);
        }

        const end = performance.now();
        times.push(end - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      console.log(`Full authorization flow (500 rules):`);
      console.log(`  avg=${avg.toFixed(3)}ms, p50=${p50.toFixed(3)}ms, p95=${p95.toFixed(3)}ms, p99=${p99.toFixed(3)}ms`);

      // Target: p95 < 50ms (without database)
      // In-memory operations should be much faster
      expect(p95).toBeLessThan(10);
    });
  });

  describe("Memory Usage", () => {
    it("should use reasonable memory for large policy sets", () => {
      // Create a large policy
      const policy = createMockCompiledPolicy(10000);

      // Rough size estimate
      const jsonStr = JSON.stringify(policy);
      const sizeKB = jsonStr.length / 1024;

      console.log(`Policy with 10000 rules: ~${sizeKB.toFixed(0)}KB serialized`);

      // Should be under 10MB for 10k rules
      expect(sizeKB).toBeLessThan(10 * 1024);
    });
  });
});

// Helper function for condition evaluation
function evaluateConditionGroup(group: ConditionGroup, subject: SubjectSnapshot): boolean {
  const operator = group.operator ?? "and";

  if (operator === "and") {
    for (const condition of group.conditions) {
      if ("operator" in condition && "conditions" in condition) {
        if (!evaluateConditionGroup(condition as ConditionGroup, subject)) {
          return false;
        }
      } else {
        const cond = condition as { field: string; operator: string; value: unknown };
        const value = resolveField(cond.field, subject);
        if (!evaluate(value, cond.operator, cond.value)) {
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
        const cond = condition as { field: string; operator: string; value: unknown };
        const value = resolveField(cond.field, subject);
        if (evaluate(value, cond.operator, cond.value)) {
          return true;
        }
      }
    }
    return false;
  }
}

function resolveField(field: string, subject: SubjectSnapshot): unknown {
  const parts = field.split(".");
  let value: unknown = subject;

  for (const part of parts.slice(1)) { // Skip "subject" prefix
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

function evaluate(fieldValue: unknown, operator: string, compareValue: unknown): boolean {
  switch (operator) {
    case "eq":
      return fieldValue === compareValue;
    case "ne":
      return fieldValue !== compareValue;
    case "in":
      return Array.isArray(compareValue) && compareValue.includes(fieldValue);
    case "contains":
      return typeof fieldValue === "string" && typeof compareValue === "string" &&
        fieldValue.includes(compareValue);
    default:
      return false;
  }
}
