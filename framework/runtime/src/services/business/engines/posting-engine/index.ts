// framework/runtime/src/services/business/engines/posting-engine/index.ts

import type { Container } from "../../../../kernel/container";
import type { RuntimeModule } from "../../../types";

export const postingEngineModule: RuntimeModule = {
  name: "engine.posting",

  register(c: Container) {
    // Register posting repositories and services
  },

  contribute(c: Container) {
    // Register health checks, event consumers, background jobs
  },
};

// Re-export domain types
export type {
  ChartOfAccounts,
  CreateAccountInput,
  AccountType,
  NormalBalance,
  SubledgerType,
  CostCenter,
  ProfitCenter,
  FiscalPeriod,
  PeriodStatus,
  AccountingProfile,
  PostingPatternEntry,
  JournalEntry,
  JournalLine,
  CreateJournalEntryInput,
  CreateJournalLineInput,
  JEStatus,
  GLBalance,
  // Period Close Governance types
  PeriodCloseTask,
  PeriodCloseChecklist,
  CloseTaskCategory,
  CloseTaskCompletionMode,
  CloseGateTarget,
  ChecklistTaskStatus,
  CloseGateResult,
  CloseProgress,
  // Phase 3: Activity + Assignment
  CloseTaskSeverity,
  CloseActivityType,
  CloseActivityActorType,
  PeriodCloseActivity,
  // Phase 5: Orchestration Graph types
  PeriodCloseTaskDependency,
  PeriodCloseTaskNode,
  PeriodCloseGraphResult,
  ReadyTaskResult,
  BlockingTaskResult,
  CriticalPathResult,
  ClosePredictionResult,
  GraphValidationResult,
  TaskReadinessState,
  DependencySatisfactionResult,
  DependencySatisfactionMode,
  // Phase 6: Readiness Snapshot
  PeriodCloseReadinessSnapshot,
  SnapshotSource,
  // Phase 6.1: Risk Signals
  CloseRiskRuleType,
  RiskSignalState,
  SuppressionScope,
  CloseRiskRule,
  CloseRiskSignal,
  RiskEvaluationContext,
  RiskEvaluationResult,
  RiskEvaluationBatchResult,
  RiskSignalActivityPayload,
  // Phase 6.2: Operations, Events, Scheduling
  RiskSignalEventType,
  RiskSignalEventPayload,
  RiskSignalOperationsResult,
  RiskSignalTransitionResult,
  CloseRiskSchedule,
  // Phase 9: Prescriptive Close Automation
  CloseActionTriggerType,
  CloseActionType,
  CloseActionExecutionMode,
  CloseActionLogStatus,
  CloseActionPolicy,
  CloseActionLogEntry,
  CloseBottleneckPattern,
  CloseRecommendation,
} from "./domain/types";
export {
  PERIOD_TRANSITIONS,
  CHECKLIST_TASK_TRANSITIONS,
  RISK_SIGNAL_TRANSITIONS,
  RISK_SIGNAL_EVENT_MAP,
  RISK_SIGNAL_ACTIVITY_MAP,
  SAFE_ACTION_TYPES,
} from "./domain/types";

// Re-export shared engine types
export type { OperationContext } from "../shared/engine-base";

// Re-export services
export type { PostingService } from "./services/posting-service";
export { DefaultPostingService } from "./services/posting-service";
export type {
  PeriodCloseService,
  GateDenialResponse,
  GateDenialDetail,
  GateDenialReasonCode,
  MaterializeResult,
  CloseApprovalOps,
} from "./services/period-close-service";
export { DefaultPeriodCloseService } from "./services/period-close-service";
export type { PeriodCloseGraphService } from "./services/period-close-graph-service";
export { DefaultPeriodCloseGraphService } from "./services/period-close-graph-service";
export type {
  CloseRiskSignalOperationsService,
  RiskEvaluationContextLoader,
} from "./services/close-risk-signal-operations";
export { DefaultCloseRiskSignalOperationsService } from "./services/close-risk-signal-operations";
// Phase 6.2b: Event publisher infrastructure
export type { RiskSignalEventEmitter } from "./services/risk-signal-event-publisher";
export {
  buildRiskSignalDomainEvent,
  createEventBusEmitter,
  NO_OP_EMITTER,
} from "./services/risk-signal-event-publisher";
export type {
  OutboxRow,
  OutboxDrainResult,
  OutboxEventPublisher,
  DomainEventOutboxRepo,
  DrainDomainOutboxPayload,
} from "./services/domain-event-outbox-consumer";
export {
  DomainEventOutboxConsumer,
  createOutboxRepo,
  createDrainDomainOutboxHandler,
} from "./services/domain-event-outbox-consumer";
export type {
  CloseRiskSignalDispatcher,
  ActiveCloseContext,
  ActiveCloseContextDiscovery,
  DispatchResult,
} from "./services/close-risk-signal-dispatcher";
export {
  DefaultCloseRiskSignalDispatcher,
  DefaultActiveCloseContextDiscovery,
} from "./services/close-risk-signal-dispatcher";

// Re-export close handler registry
export type {
  CloseHandler,
  CloseHandlerResult,
  CloseHandlerParams,
} from "./domain/close-handler-registry";
export { CloseHandlerRegistry } from "./domain/close-handler-registry";

// Re-export concrete close handlers
export {
  TrialBalanceCloseHandler,
  DepreciationCheckHandler,
  FxRevaluationCheckHandler,
  BankReconCheckHandler,
} from "./handlers/close-system-handlers";

// Re-export persistence
export type { JournalEntryRepo } from "./persistence/journal-entry-repo";
export type { FiscalPeriodRepo } from "./persistence/fiscal-period-repo";
export type { ChartOfAccountsRepo } from "./persistence/chart-of-accounts-repo";
export type { GLBalanceRepo } from "./persistence/gl-balance-repo";
export { DefaultGLBalanceRepo } from "./persistence/default-gl-balance-repo";
export type {
  PeriodCloseTaskRepo,
  PeriodCloseChecklistRepo,
  PeriodCloseActivityRepo,
  CloseOrchestrationSnapshotRepo,
  CloseRiskRuleRepo,
  CloseRiskSignalRepo,
  CloseTaskDurationHistoryRepo,
  CloseActionPolicyRepo,
  CloseActionLogRepo,
  CloseBottleneckPatternRepo,
} from "./persistence/period-close-repo";

// Phase 9: Recommendation Engine
export type {
  CloseRecommendationEngine,
  CloseActionExecutor,
  RecommendationEvaluationContext,
  RecommendationEngineResult,
} from "./services/close-recommendation-engine";
export { DefaultCloseRecommendationEngine } from "./services/close-recommendation-engine";

// Re-export domain logic
export {
  validateDoubleEntry,
  validateJournalLines,
} from "./domain/double-entry-validator";
export {
  canPostToPeriod,
  isValidPeriodTransition,
  findPeriodForDate,
  canTransitionPeriod,
  getTransitionSideEffects,
} from "./domain/period-control";
export {
  isValidChecklistTransition,
  canWaiveTask,
  canCompleteTask,
  canFailTask,
  canBlockTask,
  isGatedTransition,
  evaluateGate,
  computeDependencySatisfaction,
  isTaskRequiredForTarget,
} from "./domain/period-close-governance";
export {
  evaluateRiskRules,
  computeFingerprint,
  isValidSignalTransition,
} from "./domain/close-risk-evaluator";
