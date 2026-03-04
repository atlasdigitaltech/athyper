/**
 * Policy Evaluation Module
 *
 * Exports all components for the policy evaluation engine:
 * - Types and contracts (PolicyInput, PolicyDecision, etc.)
 * - Evaluator service
 * - Facts provider
 * - Policy store
 * - Observability (metrics, tracing, logging)
 * - Integration points (middleware, workflow, UI, batch)
 */

// ============================================================================
// Types and Contracts
// ============================================================================

export type {
  PolicySubject,
  PolicyResource,
  PolicyAction,
  PolicyContext,
  PolicyInput,
  PolicyDecision,
  PolicyEvaluationOptions,
  MatchedRule,
  PolicyObligation,
  TraceStep,
  ConflictResolution,
  IPolicyEvaluator,
  PolicyErrorCode,
} from "./types.js";

export {
  DEFAULT_EVALUATION_OPTIONS,
  SCOPE_SPECIFICITY_ORDER,
  SUBJECT_SPECIFICITY_ORDER,
  PolicyErrorCodes,
  PolicyEvaluationError,
  compareRules,
} from "./types.js";

// ============================================================================
// Evaluator Service
// ============================================================================

export type { PolicyEvaluatorConfig } from "./evaluator.js";

export { PolicyEvaluatorService, createPolicyEvaluator } from "./evaluator.js";

// ============================================================================
// Facts Provider
// ============================================================================

export type {
  FactsProviderConfig,
  ResolvedFacts,
  IFactsProvider,
} from "./facts-provider.js";

export { FactsProviderService } from "./facts-provider.js";

// ============================================================================
// Policy Store
// ============================================================================

export type {
  PolicyDefinition,
  PolicyVersion,
  PolicyRule,
  RuleOperation,
  VersionSelection,
  CacheInvalidationEvent,
  IPolicyStore,
} from "./policy-store.js";

export {
  PolicyStoreService,
  PolicyHotReloadManager,
  createPolicyStore,
} from "./policy-store.js";

// ============================================================================
// Observability
// ============================================================================

export type {
  MetricLabels,
  IMetricsCollector,
  SpanContext,
  SpanAttributes,
  ISpan,
  ITracer,
  LogLevel,
  PolicyEvalLog,
  IPolicyLogger,
  PolicyObservabilityConfig,
} from "./observability.js";

export {
  ConsoleMetricsCollector,
  ConsoleTracer,
  NoOpTracer,
  StructuredPolicyLogger,
  PolicyObservability,
  createPolicyObservability,
} from "./observability.js";

// ============================================================================
// Integration Points
// ============================================================================

export type {
  MiddlewareContext,
  PolicyMiddlewareOptions,
  WorkflowTransitionContext,
  WorkflowAuthResult,
  UICapabilitiesResponse,
  BatchAuthRequest,
  BatchAuthResult,
  ComplianceCheckResult,
} from "./integrations.js";

export {
  createPolicyMiddleware,
  WorkflowPolicyIntegration,
  UICapabilityService,
  BatchPolicyProcessor,
  createWorkflowIntegration,
  createUICapabilityService,
  createBatchProcessor,
} from "./integrations.js";
