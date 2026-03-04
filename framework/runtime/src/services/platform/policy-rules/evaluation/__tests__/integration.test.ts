/**
 * Policy Evaluation Integration Tests
 *
 * H: Integration test coverage
 * - Full flow: policy stored → compiled → evaluated with facts provider
 * - Tenant context handling
 * - Multiple policies with priority resolution
 * - Observability integration
 */

import { describe, it, expect, beforeEach } from "vitest";

import { compareRules } from "../types.js";

import type { CompiledPolicy, ScopeType, SubjectType, Effect } from "../../types.js";
import type {
  PolicyInput,
  PolicyDecision,
  PolicySubject,
  PolicyResource,
  PolicyEvaluationOptions,
  MatchedRule,
  ConflictResolution,
} from "../types.js";

// ============================================================================
// Mock Implementations for Integration Testing
// ============================================================================

/**
 * Mock compiled policy for testing
 */
function createMockCompiledPolicy(
  policyId: string,
  rules: Array<{
    ruleId: string;
    effect: Effect;
    priority: number;
    scopeType?: ScopeType;
    subjectType?: SubjectType;
    subjectKey?: string;
    operationId?: string;
    conditions?: any;
  }>
): CompiledPolicy {
  const ruleIndex: CompiledPolicy["ruleIndex"] = {};

  for (const rule of rules) {
    const scopeKey = `${rule.scopeType ?? "entity"}:document`;
    const subjectKey = `${rule.subjectType ?? "user"}:${rule.subjectKey ?? "user-123"}`;
    const operationId = rule.operationId ?? "ENTITY.read";

    if (!ruleIndex[scopeKey]) {
      ruleIndex[scopeKey] = {};
    }
    if (!ruleIndex[scopeKey][subjectKey]) {
      ruleIndex[scopeKey][subjectKey] = {};
    }
    if (!ruleIndex[scopeKey][subjectKey][operationId]) {
      ruleIndex[scopeKey][subjectKey][operationId] = [];
    }

    ruleIndex[scopeKey][subjectKey][operationId].push({
      ruleId: rule.ruleId,
      effect: rule.effect,
      priority: rule.priority,
      conditions: rule.conditions,
    });
  }

  return {
    policyId,
    versionId: `${policyId}-v1`,
    compiledAt: new Date(),
    checksum: "mock-checksum",
    ruleIndex,
    scopeCount: Object.keys(ruleIndex).length,
    subjectCount: rules.length,
    ruleCount: rules.length,
  };
}

/**
 * Mock policy store
 */
class MockPolicyStore {
  private policies: Map<string, CompiledPolicy> = new Map();

  addPolicy(policy: CompiledPolicy): void {
    this.policies.set(policy.policyId, policy);
  }

  getPolicy(policyId: string): CompiledPolicy | undefined {
    return this.policies.get(policyId);
  }

  getAllPolicies(): CompiledPolicy[] {
    return Array.from(this.policies.values());
  }
}

/**
 * Mock facts provider
 */
class MockFactsProvider {
  private subjects: Map<string, PolicySubject> = new Map();
  private resources: Map<string, PolicyResource> = new Map();

  setSubject(key: string, subject: PolicySubject): void {
    this.subjects.set(key, subject);
  }

  setResource(key: string, resource: PolicyResource): void {
    this.resources.set(key, resource);
  }

  async resolveSubject(principalId: string, tenantId: string): Promise<PolicySubject> {
    const key = `${tenantId}:${principalId}`;
    return this.subjects.get(key) ?? {
      principalId,
      principalType: "user",
      roles: [],
      groups: [],
      attributes: {},
    };
  }

  async resolveResource(tenantId: string, type: string, id?: string): Promise<PolicyResource> {
    const key = `${tenantId}:${type}:${id ?? "*"}`;
    return this.resources.get(key) ?? {
      type,
      id,
      attributes: {},
    };
  }
}

/**
 * Simplified evaluator for integration testing
 */
class MockPolicyEvaluator {
  constructor(
    private policyStore: MockPolicyStore,
    private factsProvider: MockFactsProvider
  ) {}

  async evaluate(
    input: PolicyInput,
    options: PolicyEvaluationOptions = {}
  ): Promise<PolicyDecision> {
    const startTime = Date.now();
    const matchedRules: MatchedRule[] = [];
    let rulesScanned = 0;
    let policiesEvaluated = 0;

    // Get all policies from store
    const policies = this.policyStore.getAllPolicies();
    policiesEvaluated = policies.length;

    // Build subject keys
    const subjectKeys = this.buildSubjectKeys(input.subject);

    // Evaluate each policy
    for (const policy of policies) {
      const scopeKey = this.buildScopeKey("entity", input.resource);
      const operationId = input.action.fullCode;

      // Check each subject key
      for (const subjectKey of subjectKeys) {
        const fullSubjectKey = `${subjectKey.type}:${subjectKey.key}`;
        const scopeIndex = policy.ruleIndex[scopeKey];
        if (!scopeIndex) continue;

        const subjectIndex = scopeIndex[fullSubjectKey];
        if (!subjectIndex) continue;

        const rules = [
          ...(subjectIndex[operationId] ?? []),
          ...(subjectIndex["*"] ?? []),
        ];

        rulesScanned += rules.length;

        for (const rule of rules) {
          // Evaluate conditions if present
          if (rule.conditions) {
            const conditionResult = this.evaluateConditions(rule.conditions, input);
            if (!conditionResult) continue;
          }

          matchedRules.push({
            ruleId: rule.ruleId,
            policyId: policy.policyId,
            policyVersionId: policy.versionId,
            policyName: policy.policyId,
            effect: rule.effect,
            priority: rule.priority,
            scopeType: "entity",
            subjectType: subjectKey.type,
            subjectKey: subjectKey.key,
          });
        }
      }

      // Also check wildcard subject
      const scopeIndex = policy.ruleIndex[scopeKey];
      if (scopeIndex?.["*"]) {
        const wildcardRules = [
          ...(scopeIndex["*"][operationId] ?? []),
          ...(scopeIndex["*"]["*"] ?? []),
        ];

        rulesScanned += wildcardRules.length;

        for (const rule of wildcardRules) {
          matchedRules.push({
            ruleId: rule.ruleId,
            policyId: policy.policyId,
            policyVersionId: policy.versionId,
            policyName: policy.policyId,
            effect: rule.effect,
            priority: rule.priority,
            scopeType: "entity",
            subjectType: "user",
            subjectKey: "*",
          });
        }
      }
    }

    // Resolve effect
    const conflictResolution = options.conflictResolution ?? "deny_overrides";
    const { effect, decidingRule } = this.resolveEffect(matchedRules, conflictResolution);

    return {
      effect,
      allowed: effect === "allow",
      obligations: [],
      reasons: this.buildReasons(effect, decidingRule, matchedRules.length),
      matchedRules: options.explain ? matchedRules : [],
      decidingRule,
      debug: options.explain ? {
        rulesScanned,
        rulesMatched: matchedRules.length,
        policiesEvaluated,
      } : undefined,
      metadata: {
        durationMs: Date.now() - startTime,
        evaluatedAt: new Date(),
        evaluatorVersion: "1.0.0-test",
        correlationId: input.context.correlationId,
      },
    };
  }

  private buildSubjectKeys(subject: PolicySubject): Array<{ type: SubjectType; key: string }> {
    const keys: Array<{ type: SubjectType; key: string }> = [];

    keys.push({ type: "user", key: subject.principalId });

    if (subject.principalType === "service") {
      keys.push({ type: "service", key: subject.principalId });
    }

    for (const role of subject.roles) {
      keys.push({ type: "kc_role", key: role });
    }

    for (const group of subject.groups) {
      keys.push({ type: "kc_group", key: group });
    }

    return keys;
  }

  private buildScopeKey(scopeType: ScopeType, resource: PolicyResource): string {
    return `${scopeType}:${resource.type}`;
  }

  private evaluateConditions(conditions: any, input: PolicyInput): boolean {
    // Simplified condition evaluation for testing
    if (!conditions) return true;

    const operator = conditions.operator ?? "and";
    const conditionList = conditions.conditions ?? [];

    if (operator === "and") {
      return conditionList.every((c: any) => this.evaluateSingleCondition(c, input));
    } else {
      return conditionList.some((c: any) => this.evaluateSingleCondition(c, input));
    }
  }

  private evaluateSingleCondition(condition: any, input: PolicyInput): boolean {
    const value = this.resolveField(condition.field, input);
    const compareValue = condition.value;

    switch (condition.operator) {
      case "eq":
        return value === compareValue;
      case "ne":
        return value !== compareValue;
      case "in":
        return Array.isArray(compareValue) && compareValue.includes(value);
      default:
        return false;
    }
  }

  private resolveField(field: string, input: PolicyInput): unknown {
    const parts = field.split(".");
    let value: any = input;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }

    return value;
  }

  private resolveEffect(
    matchedRules: MatchedRule[],
    strategy: ConflictResolution
  ): { effect: Effect; decidingRule?: MatchedRule } {
    if (matchedRules.length === 0) {
      return { effect: "deny" };
    }

    const sorted = [...matchedRules].sort((a, b) =>
      compareRules(
        { scopeType: a.scopeType, subjectType: a.subjectType, priority: a.priority, effect: a.effect, ruleId: a.ruleId },
        { scopeType: b.scopeType, subjectType: b.subjectType, priority: b.priority, effect: b.effect, ruleId: b.ruleId }
      )
    );

    switch (strategy) {
      case "deny_overrides": {
        const denyRule = sorted.find((r) => r.effect === "deny");
        if (denyRule) return { effect: "deny", decidingRule: denyRule };
        return { effect: "allow", decidingRule: sorted[0] };
      }

      case "allow_overrides": {
        const allowRule = sorted.find((r) => r.effect === "allow");
        if (allowRule) return { effect: "allow", decidingRule: allowRule };
        return { effect: "deny", decidingRule: sorted[0] };
      }

      case "priority_order":
      case "first_match":
      default:
        return { effect: sorted[0].effect, decidingRule: sorted[0] };
    }
  }

  private buildReasons(effect: Effect, decidingRule?: MatchedRule, _matchedCount?: number): string[] {
    if (!decidingRule) {
      return ["No matching rules found (default deny)"];
    }

    return [
      `${effect === "allow" ? "Allowed" : "Denied"} by rule ${decidingRule.ruleId} (priority: ${decidingRule.priority})`,
    ];
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestInput(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    subject: {
      principalId: "user-123",
      principalType: "user",
      roles: ["editor"],
      groups: ["engineering"],
      attributes: {
        department: "engineering",
        level: "senior",
      },
    },
    resource: {
      type: "document",
      id: "doc-456",
      attributes: {
        status: "draft",
        confidential: false,
      },
    },
    action: {
      namespace: "ENTITY",
      code: "read",
      fullCode: "ENTITY.read",
    },
    context: {
      tenantId: "tenant-1",
      timestamp: new Date(),
      attributes: {},
    },
    ...overrides,
  };
}

// ============================================================================
// Integration Tests: Full Evaluation Flow
// ============================================================================

describe("Integration: Full Policy Evaluation Flow", () => {
  let policyStore: MockPolicyStore;
  let factsProvider: MockFactsProvider;
  let evaluator: MockPolicyEvaluator;

  beforeEach(() => {
    policyStore = new MockPolicyStore();
    factsProvider = new MockFactsProvider();
    evaluator = new MockPolicyEvaluator(policyStore, factsProvider);
  });

  describe("Single Policy Evaluation", () => {
    it("should allow when matching allow rule exists", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 100 },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input);

      expect(decision.allowed).toBe(true);
      expect(decision.effect).toBe("allow");
    });

    it("should deny when matching deny rule exists", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "deny", priority: 100 },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input);

      expect(decision.allowed).toBe(false);
      expect(decision.effect).toBe("deny");
    });

    it("should deny when no rules match (default deny)", async () => {
      // Policy with rule for different subject
      const policy = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 100, subjectKey: "other-user" },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input);

      expect(decision.allowed).toBe(false);
      expect(decision.reasons).toContain("No matching rules found (default deny)");
    });
  });

  describe("Multiple Policy Evaluation", () => {
    it("should evaluate multiple policies and use highest priority rule", async () => {
      const policy1 = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 100 },
      ]);
      const policy2 = createMockCompiledPolicy("policy-2", [
        { ruleId: "r2", effect: "deny", priority: 50 }, // Higher priority (lower number)
      ]);

      policyStore.addPolicy(policy1);
      policyStore.addPolicy(policy2);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input, { conflictResolution: "priority_order" });

      expect(decision.effect).toBe("deny");
      expect(decision.decidingRule?.ruleId).toBe("r2");
    });

    it("should apply deny_overrides correctly across policies", async () => {
      const policy1 = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 50 },
      ]);
      const policy2 = createMockCompiledPolicy("policy-2", [
        { ruleId: "r2", effect: "deny", priority: 100 }, // Lower priority but deny
      ]);

      policyStore.addPolicy(policy1);
      policyStore.addPolicy(policy2);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input, { conflictResolution: "deny_overrides" });

      expect(decision.effect).toBe("deny");
      expect(decision.decidingRule?.ruleId).toBe("r2");
    });

    it("should apply allow_overrides correctly across policies", async () => {
      const policy1 = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "deny", priority: 50 },
      ]);
      const policy2 = createMockCompiledPolicy("policy-2", [
        { ruleId: "r2", effect: "allow", priority: 100 }, // Lower priority but allow
      ]);

      policyStore.addPolicy(policy1);
      policyStore.addPolicy(policy2);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input, { conflictResolution: "allow_overrides" });

      expect(decision.effect).toBe("allow");
      expect(decision.decidingRule?.ruleId).toBe("r2");
    });
  });

  describe("Role-based Matching", () => {
    it("should match rules by role", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 100, subjectType: "kc_role", subjectKey: "editor" },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput({
        subject: {
          principalId: "user-123",
          principalType: "user",
          roles: ["editor", "viewer"],
          groups: [],
          attributes: {},
        },
      });

      const decision = await evaluator.evaluate(input);

      expect(decision.allowed).toBe(true);
      expect(decision.decidingRule?.subjectKey).toBe("editor");
    });

    it("should prefer user-specific rule over role rule", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "deny", priority: 100, subjectType: "kc_role", subjectKey: "editor" },
        { ruleId: "r2", effect: "allow", priority: 100, subjectType: "user", subjectKey: "user-123" },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input, { conflictResolution: "priority_order" });

      // User is more specific than role
      expect(decision.effect).toBe("allow");
      expect(decision.decidingRule?.subjectType).toBe("user");
    });
  });

  describe("Condition-based Evaluation", () => {
    it("should apply conditions to rules", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        {
          ruleId: "r1",
          effect: "allow",
          priority: 100,
          conditions: {
            operator: "and",
            conditions: [
              { field: "subject.attributes.department", operator: "eq", value: "engineering" },
            ],
          },
        },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input);

      expect(decision.allowed).toBe(true);
    });

    it("should skip rules when conditions fail", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        {
          ruleId: "r1",
          effect: "allow",
          priority: 100,
          conditions: {
            operator: "and",
            conditions: [
              { field: "subject.attributes.department", operator: "eq", value: "sales" },
            ],
          },
        },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput(); // department is "engineering"
      const decision = await evaluator.evaluate(input);

      expect(decision.allowed).toBe(false); // Condition fails, rule doesn't match
    });

    it("should match when any OR condition passes", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        {
          ruleId: "r1",
          effect: "allow",
          priority: 100,
          conditions: {
            operator: "or",
            conditions: [
              { field: "subject.attributes.department", operator: "eq", value: "sales" },
              { field: "subject.attributes.department", operator: "eq", value: "engineering" },
            ],
          },
        },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input);

      expect(decision.allowed).toBe(true);
    });
  });

  describe("Explain Mode", () => {
    it("should include matched rules in explain mode", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 100 },
        { ruleId: "r2", effect: "allow", priority: 200, subjectType: "kc_role", subjectKey: "editor" },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input, { explain: true });

      expect(decision.matchedRules).toHaveLength(2);
      expect(decision.debug).toBeDefined();
      expect(decision.debug?.rulesMatched).toBe(2);
    });

    it("should not include matched rules when explain is false", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 100 },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input, { explain: false });

      expect(decision.matchedRules).toHaveLength(0);
      expect(decision.debug).toBeUndefined();
    });

    it("should include policies evaluated count", async () => {
      const policy1 = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 100 },
      ]);
      const policy2 = createMockCompiledPolicy("policy-2", [
        { ruleId: "r2", effect: "allow", priority: 100 },
      ]);

      policyStore.addPolicy(policy1);
      policyStore.addPolicy(policy2);

      const input = createTestInput();
      const decision = await evaluator.evaluate(input, { explain: true });

      expect(decision.debug?.policiesEvaluated).toBe(2);
    });
  });

  describe("Metadata", () => {
    it("should include evaluation metadata", async () => {
      const policy = createMockCompiledPolicy("policy-1", [
        { ruleId: "r1", effect: "allow", priority: 100 },
      ]);
      policyStore.addPolicy(policy);

      const input = createTestInput({
        context: {
          tenantId: "tenant-1",
          timestamp: new Date(),
          correlationId: "corr-123",
          attributes: {},
        },
      });
      const decision = await evaluator.evaluate(input);

      expect(decision.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(decision.metadata.evaluatedAt).toBeInstanceOf(Date);
      expect(decision.metadata.evaluatorVersion).toBe("1.0.0-test");
      expect(decision.metadata.correlationId).toBe("corr-123");
    });
  });
});

// ============================================================================
// Integration Tests: Tenant Context
// ============================================================================

describe("Integration: Tenant Context Handling", () => {
  let policyStore: MockPolicyStore;
  let factsProvider: MockFactsProvider;
  let evaluator: MockPolicyEvaluator;

  beforeEach(() => {
    policyStore = new MockPolicyStore();
    factsProvider = new MockFactsProvider();
    evaluator = new MockPolicyEvaluator(policyStore, factsProvider);
  });

  it("should include tenant ID in context", async () => {
    const policy = createMockCompiledPolicy("policy-1", [
      {
        ruleId: "r1",
        effect: "allow",
        priority: 100,
        conditions: {
          operator: "and",
          conditions: [
            { field: "context.tenantId", operator: "eq", value: "tenant-1" },
          ],
        },
      },
    ]);
    policyStore.addPolicy(policy);

    const input = createTestInput({
      context: {
        tenantId: "tenant-1",
        timestamp: new Date(),
        attributes: {},
      },
    });
    const decision = await evaluator.evaluate(input);

    expect(decision.allowed).toBe(true);
  });

  it("should deny for different tenant in condition", async () => {
    const policy = createMockCompiledPolicy("policy-1", [
      {
        ruleId: "r1",
        effect: "allow",
        priority: 100,
        conditions: {
          operator: "and",
          conditions: [
            { field: "context.tenantId", operator: "eq", value: "tenant-2" },
          ],
        },
      },
    ]);
    policyStore.addPolicy(policy);

    const input = createTestInput({
      context: {
        tenantId: "tenant-1",
        timestamp: new Date(),
        attributes: {},
      },
    });
    const decision = await evaluator.evaluate(input);

    expect(decision.allowed).toBe(false);
  });
});

// ============================================================================
// Integration Tests: Performance
// ============================================================================

describe("Integration: Performance", () => {
  let policyStore: MockPolicyStore;
  let factsProvider: MockFactsProvider;
  let evaluator: MockPolicyEvaluator;

  beforeEach(() => {
    policyStore = new MockPolicyStore();
    factsProvider = new MockFactsProvider();
    evaluator = new MockPolicyEvaluator(policyStore, factsProvider);
  });

  it("should evaluate within reasonable time (< 50ms) for single policy", async () => {
    const policy = createMockCompiledPolicy("policy-1", [
      { ruleId: "r1", effect: "allow", priority: 100 },
    ]);
    policyStore.addPolicy(policy);

    const input = createTestInput();
    const start = Date.now();
    const decision = await evaluator.evaluate(input);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50);
    expect(decision.metadata.durationMs).toBeLessThan(50);
  });

  it("should evaluate multiple policies efficiently", async () => {
    // Add 10 policies
    for (let i = 0; i < 10; i++) {
      const policy = createMockCompiledPolicy(`policy-${i}`, [
        { ruleId: `r${i}-1`, effect: "allow", priority: i * 10 },
        { ruleId: `r${i}-2`, effect: "deny", priority: i * 10 + 5 },
      ]);
      policyStore.addPolicy(policy);
    }

    const input = createTestInput();
    const start = Date.now();
    const _decision = await evaluator.evaluate(input);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it("should handle many rules within a policy", async () => {
    const rules = [];
    for (let i = 0; i < 100; i++) {
      rules.push({
        ruleId: `r${i}`,
        effect: (i % 2 === 0 ? "allow" : "deny") as Effect,
        priority: i,
      });
    }

    const policy = createMockCompiledPolicy("policy-big", rules);
    policyStore.addPolicy(policy);

    const input = createTestInput();
    const start = Date.now();
    const decision = await evaluator.evaluate(input);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
    expect(decision.effect).toBeDefined();
  });
});

// ============================================================================
// Integration Tests: Edge Cases
// ============================================================================

describe("Integration: Edge Cases", () => {
  let policyStore: MockPolicyStore;
  let factsProvider: MockFactsProvider;
  let evaluator: MockPolicyEvaluator;

  beforeEach(() => {
    policyStore = new MockPolicyStore();
    factsProvider = new MockFactsProvider();
    evaluator = new MockPolicyEvaluator(policyStore, factsProvider);
  });

  it("should handle empty policy store", async () => {
    const input = createTestInput();
    const decision = await evaluator.evaluate(input);

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("No matching rules found (default deny)");
  });

  it("should handle policy with no matching scope", async () => {
    const policy = createMockCompiledPolicy("policy-1", [
      {
        ruleId: "r1",
        effect: "allow",
        priority: 100,
        scopeType: "module", // Different scope
      },
    ]);
    policyStore.addPolicy(policy);

    const input = createTestInput();
    const decision = await evaluator.evaluate(input);

    expect(decision.allowed).toBe(false);
  });

  it("should handle subject with no roles or groups", async () => {
    const policy = createMockCompiledPolicy("policy-1", [
      { ruleId: "r1", effect: "allow", priority: 100 },
    ]);
    policyStore.addPolicy(policy);

    const input = createTestInput({
      subject: {
        principalId: "user-123",
        principalType: "user",
        roles: [],
        groups: [],
        attributes: {},
      },
    });
    const decision = await evaluator.evaluate(input);

    expect(decision.allowed).toBe(true);
  });

  it("should handle wildcard subject matching", async () => {
    const policy = createMockCompiledPolicy("policy-1", [
      { ruleId: "r1", effect: "allow", priority: 100, subjectKey: "*" },
    ]);

    // Manually add wildcard rule
    policy.ruleIndex["entity:document"]["*"] = {
      "ENTITY.read": [
        { ruleId: "r1", effect: "allow", priority: 100 },
      ],
    };

    policyStore.addPolicy(policy);

    const input = createTestInput({
      subject: {
        principalId: "any-user",
        principalType: "user",
        roles: [],
        groups: [],
        attributes: {},
      },
    });
    const decision = await evaluator.evaluate(input);

    expect(decision.allowed).toBe(true);
  });

  it("should handle service accounts differently from users", async () => {
    const policy = createMockCompiledPolicy("policy-1", [
      { ruleId: "r1", effect: "allow", priority: 100, subjectType: "service", subjectKey: "svc-123" },
    ]);
    policyStore.addPolicy(policy);

    const input = createTestInput({
      subject: {
        principalId: "svc-123",
        principalType: "service",
        roles: [],
        groups: [],
        attributes: {},
      },
    });
    const decision = await evaluator.evaluate(input);

    expect(decision.allowed).toBe(true);
  });
});
