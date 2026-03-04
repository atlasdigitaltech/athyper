// framework/runtime/src/services/business/engines/decision-grid/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const decisionGridModule: RuntimeModule = {
  name: "engine.decisionGrid",

  register(c: Container) {
    // Register Decision Grid repos, services, and pipeline steps
  },

  contribute(c: Container) {
    // Register health checks, background jobs (timeout worker)
  },
};

// Re-export domain types
export type {
  TransactionPipeline,
  SubmitTransactionInput,
  TransactionLineItem,
  PipelineStep,
  PipelineStatus,
  WorkflowPath,
  PolicyAction,
  PolicyDecision,
  PolicyCondition,
  PolicyApprover,
  CompositeScoreThresholds,
  SmartDefaultRule,
  Exception,
  ExceptionScopeType,
  ExceptionStatus,
  StepResult,
} from "./domain/types.js";
export { STEP_TO_STATUS, DEFAULT_SCORE_THRESHOLDS } from "./domain/types.js";

// Re-export pipeline
export type {
  PipelineOrchestrator,
  PipelineStepExecutor,
} from "./pipeline/pipeline-orchestrator.js";
export { DefaultPipelineOrchestrator } from "./pipeline/pipeline-orchestrator.js";

// Re-export persistence
export type { PipelineRepo } from "./persistence/pipeline-repo.js";

// Re-export domain logic
export {
  calculateCompositeScore,
  scoreToWorkflowPath,
  determineMostRestrictiveAction,
} from "./domain/composite-scoring.js";
