// framework/runtime/src/services/business/engines/atlas-ai/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";
import { TOKENS } from "../../../../kernel/tokens.js";
import { DefaultActionService } from "./services/action-service.js";
import { DefaultBaselineComputeService } from "./services/baseline-compute.service.js";
import { DefaultAnomalyDetectorService } from "./services/anomaly-detector.service.js";
import { DefaultPredictionService } from "./services/prediction.service.js";
import { DefaultNarrativeService } from "./services/narrative.service.js";
import { DefaultRecommendationService } from "./services/recommendation.service.js";
import { DefaultInsightGraphService } from "./services/insight-graph.service.js";
import { DefaultFeedbackService } from "./services/feedback.service.js";

export const atlasAiModule: RuntimeModule = {
  name: "engine.atlasAi",

  register(c: Container) {
    // Action service (L3 governance)
    c.register(TOKENS.atlasActionService, async () => {
      const repo = await c.resolve<any>(TOKENS.atlasModelRegistryRepo);
      return new DefaultActionService(repo);
    }, "singleton");

    // Baseline compute service (scheduled, post-close)
    c.register(TOKENS.atlasBaselineComputeService, () => {
      return new DefaultBaselineComputeService(c);
    }, "singleton");

    // Anomaly detector service (on-demand + scheduled)
    c.register(TOKENS.atlasAnomalyService, () => {
      return new DefaultAnomalyDetectorService(c);
    }, "singleton");

    // Prediction service (Phase 2 — predictive analytics)
    c.register(TOKENS.atlasPredictionService, () => {
      return new DefaultPredictionService(c);
    }, "singleton");

    // Narrative service (Phase 3B — provider-based with template fallback)
    c.register(TOKENS.atlasNarrativeService, async () => {
      // If an LLM narrative provider is registered, use it; otherwise template-only
      let provider: import("./services/narrative-provider.js").NarrativeProvider | undefined;
      try {
        provider = await c.resolve<any>("engine.atlas.narrativeProvider");
      } catch { /* not registered — use default template provider */ }
      return new DefaultNarrativeService(c, provider);
    }, "singleton");

    // Recommendation service (Phase 4 — deterministic advisory actions)
    c.register(TOKENS.atlasRecommendationService, () => {
      return new DefaultRecommendationService(c);
    }, "singleton");

    // Insight graph service (Phase 5 — financial insight graph)
    c.register(TOKENS.atlasInsightGraphService, () => {
      return new DefaultInsightGraphService(c);
    }, "singleton");

    // Feedback service (Phase 6 — adaptive learning)
    c.register(TOKENS.atlasFeedbackService, () => {
      return new DefaultFeedbackService(c);
    }, "singleton");
  },

  async contribute(c: Container) {
    // Register scheduled jobs when job registry is available
    try {
      const jobRegistry = await c.resolve<any>("platform.jobRegistry");
      if (jobRegistry) {
        // Baseline recomputation — runs after period close
        jobRegistry.addJob?.({
          name: "atlas.job.baselineCompute",
          queue: "atlas.baselines",
          handlerToken: TOKENS.atlasBaselineComputeService,
          concurrency: 1,
        });

        // Anomaly detection — runs on schedule during close window
        jobRegistry.addJob?.({
          name: "atlas.job.anomalyDetection",
          queue: "atlas.anomalies",
          handlerToken: TOKENS.atlasAnomalyService,
          concurrency: 1,
        });

        jobRegistry.addSchedule?.({
          name: "atlas.schedule.anomalyDetection",
          cron: "0 */4 * * *",   // every 4 hours
          jobName: "atlas.job.anomalyDetection",
        });
      }
    } catch {
      // Job registry not available — graceful degradation
    }
  },
};

// Re-export domain types
export type {
  AIModelRegistry,
  CreateModelInput,
  ModelType,
  CapabilityLevel,
  ModelStatus,
  AIPrediction,
  CreatePredictionInput,
  PredictionType,
  AIAction,
  CreateActionInput,
  ActionStatus,
  AIDriftMonitor,
} from "./domain/types.js";
export {
  AUTONOMOUS_CONFIDENCE_THRESHOLD,
  DEFAULT_REVERSAL_WINDOW_MINUTES,
  MODEL_TRANSITIONS,
} from "./domain/types.js";

// Re-export anomaly types
export type {
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  AnomalyBaseline,
  AtlasAnomaly,
  AnomalyDetectionInput,
  AnomalyDetectionResult,
  BaselineComputeInput,
  BaselineComputeResult,
} from "./domain/anomaly-types.js";
export {
  ANOMALY_TRANSITIONS,
  computeAnomalySeverity,
  DEFAULT_Z_SCORE_THRESHOLD,
  CRITICAL_Z_SCORE_THRESHOLD,
} from "./domain/anomaly-types.js";

// Re-export prediction types
export type {
  CloseDurationPrediction,
  ReleaseReadinessPrediction,
  ReconCompletionPrediction,
  PredictionComputeInput,
  PredictionComputeResult,
} from "./domain/prediction-types.js";

// Re-export narrative types
export type {
  NarrativeType,
  NarrativeProvider,
  NarrativeProvenance,
  NarrativeInput,
  NarrativeOutput,
  NarrativeComputeInput,
  NarrativeComputeResult,
  AnomalyExplanationInput,
} from "./domain/narrative-types.js";
export {
  buildProvenance,
  buildAnomalyProvenance,
} from "./domain/narrative-types.js";

// Re-export services
export type { ActionService, AIActionRepo } from "./services/action-service.js";
export { DefaultActionService } from "./services/action-service.js";
export type { BaselineComputeService } from "./services/baseline-compute.service.js";
export { DefaultBaselineComputeService } from "./services/baseline-compute.service.js";
export type { AnomalyDetectorService } from "./services/anomaly-detector.service.js";
export { DefaultAnomalyDetectorService } from "./services/anomaly-detector.service.js";
export type { PredictionService } from "./services/prediction.service.js";
export { DefaultPredictionService } from "./services/prediction.service.js";
export type { NarrativeService } from "./services/narrative.service.js";
export { DefaultNarrativeService } from "./services/narrative.service.js";
export {
  renderDashboardSummary,
  renderReleaseSummary,
  renderAnomalyExplanation,
  renderCfoBrief,
} from "./services/narrative-templates.js";

// Re-export narrative providers (Phase 3B)
export type {
  NarrativeProvider as NarrativeProviderInterface,
  NarrativeProviderResult,
  LlmNarrativeProviderConfig,
} from "./services/narrative-provider.js";
export {
  TemplateNarrativeProvider,
  LlmNarrativeProvider,
  createNarrativeProvider,
} from "./services/narrative-provider.js";

// Re-export recommendation types (Phase 4)
export type {
  AtlasRecommendationType,
  AtlasRecommendationPriority,
  AtlasOwnerRole,
  AtlasLinkedEvidence,
  AtlasRecommendation,
  RecommendationProvenance,
  RecommendationComputeInput,
  RecommendationComputeResult,
} from "./domain/recommendation-types.js";
export { buildRecommendationProvenance, RECOMMENDATION_ENGINE_VERSION } from "./domain/recommendation-types.js";
export type { RecommendationService } from "./services/recommendation.service.js";
export { DefaultRecommendationService, generateRecommendations } from "./services/recommendation.service.js";

// Re-export insight graph types (Phase 5)
export type {
  InsightNodeType,
  InsightEdgeType,
  InsightNode,
  InsightEdge,
  InsightGraphResult,
  InsightGraphStats,
  InsightGraphProvenance,
  InsightGraphComputeInput,
  ReleaseNode,
  PeriodNode,
  AccountNode,
  AnomalyNode,
  RiskSignalNode,
  ReconciliationNode,
  TaskNode,
  CloseRunNode,
} from "./domain/insight-graph-types.js";
export { buildInsightGraphProvenance, INSIGHT_GRAPH_VERSION } from "./domain/insight-graph-types.js";
export type { InsightGraphService } from "./services/insight-graph.service.js";
export { DefaultInsightGraphService, materializeInsightGraph } from "./services/insight-graph.service.js";

// Re-export feedback types (Phase 6 — adaptive learning)
export type {
  FeedbackTarget,
  FeedbackVerdict,
  FeedbackReasonCode,
  AtlasFeedback,
  SubmitFeedbackInput,
  CalibrationStatus,
  CalibrationSource,
  ThresholdCalibration,
  FalsePositiveRate,
  CalibrationSuggestion,
  FeedbackEffectiveness,
  FeedbackComputeInput,
  FeedbackComputeResult,
} from "./domain/feedback-types.js";
export type { FeedbackService } from "./services/feedback.service.js";
export { DefaultFeedbackService, generateCalibrationSuggestions } from "./services/feedback.service.js";

// Re-export persistence interfaces
export type { AnomalyRepo, AnomalyBaselineRepo } from "./persistence/anomaly-repo.js";
