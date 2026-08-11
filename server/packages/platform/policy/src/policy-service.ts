import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { JsonRuleEvaluator, PolicyAction, PolicyDecision, PolicyEvaluationRequest, PolicyRepository, PolicyRuleOutcome, PolicyService } from "@athyper/server-contract-policy";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { createJsonRuleEvaluator } from "./json-rule-evaluator.js";

const PRECEDENCE: Readonly<Record<PolicyAction, number>> = { allow: 0, escalate: 1, warn: 2, require_workflow: 3, deny: 4 };

export interface PolicyServiceOptions<Transaction> {
  readonly repository: PolicyRepository<Transaction>;
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly audit: AuditRecorder<Transaction>;
  readonly evaluator?: JsonRuleEvaluator;
  readonly now?: () => Date;
}

export function createPolicyService<Transaction>(options: PolicyServiceOptions<Transaction>): PolicyService<Transaction> {
  const evaluator = options.evaluator ?? createJsonRuleEvaluator();
  return {
    evaluate(request, transaction) {
      const work = (activeTransaction: Transaction) => evaluateInTransaction(options, evaluator, request, activeTransaction);
      return transaction
        ? work(transaction)
        : options.transactions.run(request.context.planeKey, { tenantId: request.context.tenantId, principalId: request.context.principalId }, work);
    },
  };
}

async function evaluateInTransaction<Transaction>(options: PolicyServiceOptions<Transaction>, evaluator: JsonRuleEvaluator, request: PolicyEvaluationRequest, transaction: Transaction): Promise<PolicyDecision> {
  const effectiveOn = (options.now?.() ?? new Date()).toISOString().slice(0, 10);
  const definitions = await options.repository.findActive({ tenantId: request.context.tenantId, entityType: request.entityType, ...(request.policyDefinitionIds ? { policyDefinitionIds: request.policyDefinitionIds } : {}), effectiveOn }, transaction);
  const facts = Object.freeze({ ...request.facts, tenant_id: request.context.tenantId, principal_id: request.context.principalId, plane_code: request.context.planeKey });
  const outcomes: PolicyRuleOutcome[] = [];
  for (const definition of definitions) {
    for (const rule of definition.rules) {
      if (!truthy(evaluator.evaluate(rule.condition, facts))) continue;
      outcomes.push({ policyId: definition.id, policyVersionNo: definition.versionNo, policyName: definition.name, ruleId: rule.id, action: rule.action, actionConfig: rule.actionConfig, ...(rule.score !== undefined ? { score: rule.score } : {}), ...(rule.confidence !== undefined ? { confidence: rule.confidence } : {}), ...(rule.explanation ? { explanation: rule.explanation } : {}), ...(rule.approverRules !== undefined ? { approverRules: rule.approverRules } : {}), ...(rule.slaHours !== undefined ? { slaHours: rule.slaHours } : {}) });
      if (definition.evaluationMode === "first_match") break;
    }
  }
  const winning = outcomes.reduce<PolicyRuleOutcome | undefined>((best, candidate) => !best || PRECEDENCE[candidate.action] > PRECEDENCE[best.action] ? candidate : best, undefined);
  const decision: PolicyDecision = { action: winning?.action ?? "none", permitted: winning?.action !== "deny", outcomes, ...(winning ? { winning } : {}), evaluatedPolicyIds: definitions.map((definition) => definition.id), evaluatedPolicies: definitions.map((definition) => ({ id: definition.id, versionNo: definition.versionNo })) };
  await options.audit.record({ eventCode: "policy.evaluation.completed", action: "evaluate", outcome: decision.permitted ? "success" : "denied", actor: { kind: "user", principalId: request.context.principalId }, tenantId: request.context.tenantId, ...(request.entityId ? { entityId: request.entityId } : {}), entityType: request.entityType, requestId: request.context.requestId, ...(request.context.correlationId ? { correlationId: request.context.correlationId } : {}), metadata: { decision: decision.action, policyIds: decision.evaluatedPolicyIds, matchedRuleIds: outcomes.map((outcome) => outcome.ruleId), ...(request.pipelineId ? { pipelineId: request.pipelineId } : {}) } }, transaction);
  return decision;
}

function truthy(value: unknown): boolean { return Array.isArray(value) ? value.length > 0 : Boolean(value); }
