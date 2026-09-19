import { calculateDefinitionHash } from "./policy-authoring-service.js";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type {
  JsonRuleEvaluator,
  PolicyAction,
  PolicyDecision,
  PolicyDefinition,
  PolicyEvaluationRequest,
  PolicyRepository,
  PolicyRuleOutcome,
  PolicyService,
} from "@athyper/server-contract-policy";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { createJsonRuleEvaluator } from "./json-rule-evaluator.js";

const PRECEDENCE: Readonly<Record<PolicyAction, number>> = {
  allow: 0,
  escalate: 1,
  warn: 2,
  require_workflow: 3,
  deny: 4,
};

export interface PolicyServiceOptions<Transaction> {
  readonly repository: PolicyRepository<Transaction>;
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly audit: AuditRecorder<Transaction>;
  readonly evaluator?: JsonRuleEvaluator;
  /** Exact evidence requires the identity of an explicitly injected evaluator. */
  readonly evaluatorVersion?: string;
  readonly now?: () => Date;
}

export interface PolicyRuleTrace {
  readonly policyId: string;
  readonly policyVersionNo: number;
  readonly ruleId: string;
  readonly priority: number;
  readonly matched: boolean;
  readonly action: PolicyAction;
  readonly explanation?: string;
}
export interface PolicySimulation {
  readonly decision: PolicyDecision;
  readonly trace: readonly PolicyRuleTrace[];
  readonly effectiveOn: string;
  readonly audited: false;
}
export interface ExactPolicyEvaluationRequest extends PolicyEvaluationRequest {
  readonly revision: {
    readonly id: string;
    readonly version: number;
    readonly hash: string;
  };
  readonly effectiveOn: string;
}
export interface ExactPolicySimulation extends PolicySimulation {
  readonly definition: PolicyDefinition;
  readonly evaluatorVersion: string;
}
export interface ExplainablePolicyService<Transaction = unknown> {
  evaluateExact(
    request: ExactPolicyEvaluationRequest,
    transaction?: Transaction,
  ): Promise<ExactPolicySimulation>;
  simulate(
    request: PolicyEvaluationRequest,
    transaction?: Transaction,
  ): Promise<PolicySimulation>;
}

export function createPolicyService<Transaction>(
  options: PolicyServiceOptions<Transaction>,
): PolicyService<Transaction> & ExplainablePolicyService<Transaction> {
  const evaluator = options.evaluator ?? createJsonRuleEvaluator();
  return {
    evaluateExact(request, transaction) {
      const work = async (tx: Transaction): Promise<ExactPolicySimulation> => {
        if (!options.repository.findExact)
          throw new Error("POLICY_EXACT_REVISION_UNAVAILABLE");
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(request.effectiveOn) ||
          !Number.isSafeInteger(request.revision.version) ||
          request.revision.version < 1 ||
          !/^[a-f0-9]{64}$/.test(request.revision.hash)
        )
          throw new Error("POLICY_EXACT_COORDINATE_INVALID");
        const definition = await options.repository.findExact(
          {
            planeKey: request.context.planeKey,
            tenantId: request.context.tenantId,
            entityType: request.entityType,
            effectiveOn: request.effectiveOn,
            revision: request.revision,
          },
          tx,
        );
        if (
          !definition ||
          definition.id !== request.revision.id ||
          definition.tenantId !== request.context.tenantId ||
          definition.entityType !== request.entityType ||
          definition.versionNo !== request.revision.version ||
          definition.definitionHash !== request.revision.hash ||
          calculateDefinitionHash(definition) !== request.revision.hash ||
          definition.effectiveFrom > request.effectiveOn ||
          (definition.effectiveUntil &&
            definition.effectiveUntil < request.effectiveOn)
        )
          throw new Error("POLICY_EXACT_REVISION_UNAVAILABLE");
        const evaluatorVersion = options.evaluator
          ? options.evaluatorVersion
          : "athyper.json-rule/1";
        if (!evaluatorVersion)
          throw new Error("POLICY_EXACT_EVALUATOR_UNVERSIONED");
        const result = evaluateDefinitions(
          [definition],
          factsFor(request),
          evaluator,
        );
        return {
          ...result,
          definition,
          effectiveOn: request.effectiveOn,
          audited: false,
          evaluatorVersion,
        };
      };
      return transaction
        ? work(transaction)
        : options.transactions.run(
            request.context.planeKey,
            {
              tenantId: request.context.tenantId,
              principalId: request.context.principalId,
            },
            work,
          );
    },
    evaluate(request, transaction) {
      const work = (activeTransaction: Transaction) =>
        evaluateInTransaction(options, evaluator, request, activeTransaction);
      return transaction
        ? work(transaction)
        : options.transactions.run(
            request.context.planeKey,
            {
              tenantId: request.context.tenantId,
              principalId: request.context.principalId,
            },
            work,
          );
    },
    simulate(request, transaction) {
      const work = (activeTransaction: Transaction) =>
        simulateInTransaction(options, evaluator, request, activeTransaction);
      return transaction
        ? work(transaction)
        : options.transactions.run(
            request.context.planeKey,
            {
              tenantId: request.context.tenantId,
              principalId: request.context.principalId,
            },
            work,
          );
    },
  };
}

async function evaluateInTransaction<Transaction>(
  options: PolicyServiceOptions<Transaction>,
  evaluator: JsonRuleEvaluator,
  request: PolicyEvaluationRequest,
  transaction: Transaction,
): Promise<PolicyDecision> {
  const effectiveOn = (options.now?.() ?? new Date())
    .toISOString()
    .slice(0, 10);
  const definitions = await options.repository.findActive(
    {
      planeKey: request.context.planeKey,
      tenantId: request.context.tenantId,
      entityType: request.entityType,
      ...(request.policyDefinitionIds
        ? { policyDefinitionIds: request.policyDefinitionIds }
        : {}),
      effectiveOn,
    },
    transaction,
  );
  const { decision } = evaluateDefinitions(
    definitions,
    factsFor(request),
    evaluator,
  );
  await options.audit.record(
    {
      eventCode: "policy.evaluation.completed",
      action: "evaluate",
      outcome: decision.permitted ? "success" : "denied",
      actor: { kind: "user", principalId: request.context.principalId },
      tenantId: request.context.tenantId,
      ...(request.entityId ? { entityId: request.entityId } : {}),
      entityType: request.entityType,
      requestId: request.context.requestId,
      ...(request.context.correlationId
        ? { correlationId: request.context.correlationId }
        : {}),
      metadata: {
        decision: decision.action,
        policyIds: decision.evaluatedPolicyIds,
        matchedRuleIds: decision.outcomes.map((outcome) => outcome.ruleId),
        ...(request.pipelineId ? { pipelineId: request.pipelineId } : {}),
      },
    },
    transaction,
  );
  return decision;
}

async function simulateInTransaction<Transaction>(
  options: PolicyServiceOptions<Transaction>,
  evaluator: JsonRuleEvaluator,
  request: PolicyEvaluationRequest,
  transaction: Transaction,
): Promise<PolicySimulation> {
  const effectiveOn = (options.now?.() ?? new Date())
    .toISOString()
    .slice(0, 10);
  const definitions = await options.repository.findActive(
    {
      planeKey: request.context.planeKey,
      tenantId: request.context.tenantId,
      entityType: request.entityType,
      ...(request.policyDefinitionIds
        ? { policyDefinitionIds: request.policyDefinitionIds }
        : {}),
      effectiveOn,
    },
    transaction,
  );
  const evaluated = evaluateDefinitions(
    definitions,
    factsFor(request),
    evaluator,
  );
  return {
    decision: evaluated.decision,
    trace: evaluated.trace,
    effectiveOn,
    audited: false,
  };
}
function factsFor(request: PolicyEvaluationRequest) {
  return Object.freeze({
    ...request.facts,
    tenant_id: request.context.tenantId,
    principal_id: request.context.principalId,
    plane_code: request.context.planeKey,
  });
}
function evaluateDefinitions(
  definitions: readonly PolicyDefinition[],
  facts: Readonly<Record<string, unknown>>,
  evaluator: JsonRuleEvaluator,
): { decision: PolicyDecision; trace: readonly PolicyRuleTrace[] } {
  const outcomes: PolicyRuleOutcome[] = [];
  const trace: PolicyRuleTrace[] = [];
  for (const definition of definitions) {
    for (const rule of [...definition.rules].sort(
      (a, b) => a.priority - b.priority,
    )) {
      const matched = truthy(evaluator.evaluate(rule.condition, facts));
      trace.push({
        policyId: definition.id,
        policyVersionNo: definition.versionNo,
        ruleId: rule.id,
        priority: rule.priority,
        matched,
        action: rule.action,
        ...(rule.explanation ? { explanation: rule.explanation } : {}),
      });
      if (!matched) continue;
      outcomes.push({
        policyId: definition.id,
        policyVersionNo: definition.versionNo,
        policyName: definition.name,
        ruleId: rule.id,
        action: rule.action,
        actionConfig: rule.actionConfig,
        ...(rule.score !== undefined ? { score: rule.score } : {}),
        ...(rule.confidence !== undefined
          ? { confidence: rule.confidence }
          : {}),
        ...(rule.explanation ? { explanation: rule.explanation } : {}),
        ...(rule.approverRules !== undefined
          ? { approverRules: rule.approverRules }
          : {}),
        ...(rule.slaHours !== undefined ? { slaHours: rule.slaHours } : {}),
      });
      if (definition.evaluationMode === "first_match") break;
    }
  }
  const winning = outcomes.reduce<PolicyRuleOutcome | undefined>(
    (best, candidate) =>
      !best || PRECEDENCE[candidate.action] > PRECEDENCE[best.action]
        ? candidate
        : best,
    undefined,
  );
  return {
    decision: {
      action: winning?.action ?? "none",
      permitted: winning?.action !== "deny",
      outcomes,
      ...(winning ? { winning } : {}),
      evaluatedPolicyIds: definitions.map((x) => x.id),
      evaluatedPolicies: definitions.map((x) => ({
        id: x.id,
        versionNo: x.versionNo,
      })),
    },
    trace,
  };
}

function truthy(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}
