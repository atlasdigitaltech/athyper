/**
 * Policy Gate - IAM Authorization System
 *
 * Exports:
 * - PolicyGateService: Main entry point
 * - Types: AuthorizationRequest, AuthorizationDecision, etc.
 * - Sub-services for advanced usage
 */

// Main service
export { PolicyGateService, createPolicyGate } from "./policy-gate.service.js";
export type { PolicyGateConfig } from "./policy-gate.service.js";

// Types
export type {
  OperationNamespace,
  OperationCode,
  OperationInfo,
  ScopeType,
  ResourceDescriptor,
  SubjectType,
  SubjectKey,
  SubjectSnapshot,
  Effect,
  ConditionOperator,
  Condition,
  ConditionGroup,
  ABACConditions,
  PermissionRuleInfo,
  CompiledRule,
  CompiledPolicy,
  AuthorizationRequest,
  AuthorizationDecision,
  IPolicyGate,
} from "./types.js";

// Operation constants
export {
  ENTITY_OPERATIONS,
  WORKFLOW_OPERATIONS,
  UTIL_OPERATIONS,
  DELEGATION_OPERATIONS,
  COLLAB_OPERATIONS,
} from "./types.js";

// Sub-services (for advanced usage)
export { OperationCatalogService } from "./operation-catalog.service.js";
export { PolicyResolutionService } from "./policy-resolution.service.js";
export type { PolicyInfo, PolicyVersionInfo, ResolvedPolicy } from "./policy-resolution.service.js";
export { PolicyCompilerService } from "./policy-compiler.service.js";
export { SubjectResolverService } from "./subject-resolver.service.js";
export { RuleEvaluatorService } from "./rule-evaluator.service.js";
export { DecisionLoggerService } from "./decision-logger.service.js";
export type { DecisionLogEntry, DecisionLoggerConfig } from "./decision-logger.service.js";
