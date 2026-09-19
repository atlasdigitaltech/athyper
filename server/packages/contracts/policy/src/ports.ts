import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  PolicyBundle,
  PolicyDefinition,
  PolicyDecision,
  PolicyEvaluationRequest,
  PolicyRule,
  PolicyTestCase,
  PolicyTestResult,
  SignedPolicyBundle,
} from "./policy.js";

export interface PolicyRepositoryQuery {
  /** Required for caching across plane-local databases; omitted queries bypass the cache. */
  readonly planeKey?: VerifiedRequestContext["planeKey"];
  readonly tenantId: string;
  readonly entityType: string;
  readonly policyDefinitionIds?: readonly string[];
  readonly effectiveOn: string;
}

export interface ExactPolicyRepositoryQuery extends Omit<
  PolicyRepositoryQuery,
  "policyDefinitionIds"
> {
  readonly revision: {
    readonly id: string;
    readonly version: number;
    readonly hash: string;
  };
}

export interface PolicyRepository<Transaction = unknown> {
  /** Exact published row; no active-head fallback or cache. Unavailable implementations fail closed. */
  findExact?(
    query: ExactPolicyRepositoryQuery,
    transaction: Transaction,
  ): Promise<PolicyDefinition | undefined>;
  findActive(
    query: PolicyRepositoryQuery,
    transaction: Transaction,
  ): Promise<readonly PolicyDefinition[]>;
}

/** Evaluation may join an existing capability transaction or open a plane transaction itself. */
export interface PolicyService<Transaction = unknown> {
  evaluate(
    request: PolicyEvaluationRequest,
    transaction?: Transaction,
  ): Promise<PolicyDecision>;
}

export interface JsonRuleEvaluator {
  evaluate(
    expression: unknown,
    facts: Readonly<Record<string, unknown>>,
  ): unknown;
}

export interface PolicyAuthoringRepository<Transaction = unknown> {
  getDefinition(
    id: string,
    transaction: Transaction,
  ): Promise<PolicyDefinition | undefined>;
  createDraft(
    input: {
      definition: Omit<PolicyDefinition, "id" | "rules">;
      rules: readonly PolicyRule[];
      tests?: readonly Omit<PolicyTestCase, "id" | "definitionId">[];
      predecessorId?: string;
    },
    transaction: Transaction,
  ): Promise<PolicyDefinition>;
  saveTestCase(
    test: Omit<PolicyTestCase, "id"> & { readonly id?: string },
    transaction: Transaction,
  ): Promise<PolicyTestCase>;
  deleteTestCase(id: string, transaction: Transaction): Promise<void>;
  listTestCases(
    definitionId: string,
    transaction: Transaction,
  ): Promise<readonly PolicyTestCase[]>;
  saveTestResults(
    results: readonly PolicyTestResult[],
    transaction: Transaction,
  ): Promise<void>;
  dependenciesExist(
    dependencies: readonly string[],
    transaction: Transaction,
  ): Promise<readonly string[]>;
  requestApproval(
    definitionId: string,
    transaction: Transaction,
  ): Promise<void>;
  activate(
    definitionId: string,
    expectedHash: string,
    transaction: Transaction,
  ): Promise<void>;
}

export interface PolicyBundleSigner {
  sign(
    payload: string,
  ): Promise<{ readonly keyId: string; readonly signature: string }>;
  verify(payload: string, keyId: string, signature: string): Promise<boolean>;
}

export interface PolicyAuthoringService<Transaction = unknown> {
  createSuccessor(
    definitionId: string,
    transaction: Transaction,
  ): Promise<PolicyDefinition>;
  saveTestCase(
    test: Omit<PolicyTestCase, "id"> & { readonly id?: string },
    transaction: Transaction,
  ): Promise<PolicyTestCase>;
  deleteTestCase(testCaseId: string, transaction: Transaction): Promise<void>;
  listTestCases(
    definitionId: string,
    transaction: Transaction,
  ): Promise<readonly PolicyTestCase[]>;
  validate(definition: PolicyDefinition): readonly string[];
  diff(left: PolicyDefinition, right: PolicyDefinition): readonly string[];
  runTest(
    definitionId: string,
    testCaseId: string,
    transaction: Transaction,
  ): Promise<PolicyTestResult>;
  runAllTests(
    definitionId: string,
    transaction: Transaction,
  ): Promise<readonly PolicyTestResult[]>;
  exportBundle(
    definitionId: string,
    dependencies: readonly string[],
    transaction: Transaction,
  ): Promise<SignedPolicyBundle>;
  importBundle(
    document: string,
    transaction: Transaction,
  ): Promise<PolicyDefinition>;
  activate(definitionId: string, transaction: Transaction): Promise<void>;
}
