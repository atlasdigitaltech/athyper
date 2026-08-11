import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type PolicyAction = "allow" | "deny" | "warn" | "require_workflow" | "escalate";
export type PolicyEvaluationMode = "first_match" | "accumulate" | "all";

export interface PolicyRule {
  readonly id: string;
  readonly priority: number;
  readonly condition: JsonValue;
  readonly action: PolicyAction;
  readonly actionConfig: Readonly<Record<string, unknown>>;
  readonly score?: number;
  readonly confidence?: number;
  readonly explanation?: string;
  readonly approverRules?: JsonValue;
  readonly slaHours?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PolicyDefinition {
  readonly id: string;
  readonly tenantId?: string;
  readonly entityType: string;
  readonly name: string;
  readonly priority: number;
  readonly evaluationMode: PolicyEvaluationMode;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly versionNo: number;
  /** SHA-256 of the normalized definition and its ordered rules. */
  readonly definitionHash?: string;
  readonly rules: readonly PolicyRule[];
}

export type PolicyRevisionStatus = "draft" | "pending_approval" | "published" | "retired";
export type FieldDecision =
  | { readonly action: "allow" }
  | { readonly action: "deny"; readonly reason?: string }
  | { readonly action: "mask"; readonly mask: string }
  | { readonly action: "transform-reference"; readonly transformReference: string };

export interface PolicyTestCase {
  readonly id: string;
  readonly definitionId: string;
  readonly code: string;
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly expected: Readonly<Record<string, unknown>>;
}

export interface PolicyTestResult {
  readonly testCaseId: string;
  readonly definitionHash: string;
  readonly passed: boolean;
  readonly actual: PolicyDecision;
  readonly executedAt: string;
}

export interface PolicyBundle {
  readonly schema: "athyper.policy-bundle";
  readonly version: 1;
  readonly definition: Omit<PolicyDefinition, "id">;
  readonly tests: readonly Omit<PolicyTestCase, "id" | "definitionId">[];
  readonly dependencies: readonly string[];
  readonly definitionHash: string;
}

export interface SignedPolicyBundle {
  readonly bundle: PolicyBundle;
  readonly keyId: string;
  readonly signature: string;
}

export interface PolicyEvaluationRequest {
  readonly context: VerifiedRequestContext;
  readonly entityType: string;
  readonly entityId?: string;
  readonly facts: Readonly<Record<string, unknown>>;
  readonly policyDefinitionIds?: readonly string[];
  readonly pipelineId?: string;
}

export interface PolicyRuleOutcome {
  readonly policyId: string;
  readonly policyVersionNo: number;
  readonly policyName: string;
  readonly ruleId: string;
  readonly action: PolicyAction;
  readonly actionConfig: Readonly<Record<string, unknown>>;
  readonly score?: number;
  readonly confidence?: number;
  readonly explanation?: string;
  readonly approverRules?: JsonValue;
  readonly slaHours?: number;
}

export interface PolicyDecision {
  readonly action: PolicyAction | "none";
  readonly permitted: boolean;
  readonly outcomes: readonly PolicyRuleOutcome[];
  readonly winning?: PolicyRuleOutcome;
  readonly evaluatedPolicyIds: readonly string[];
  readonly evaluatedPolicies: readonly { readonly id: string; readonly versionNo: number }[];
}
