// framework/runtime/src/services/business/engines/report-pack-engine/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const reportPackEngineModule: RuntimeModule = {
  name: "engine.report-pack",

  register(c: Container) {
    // Register pack repositories and services
  },

  contribute(c: Container) {
    // Register health checks, event consumers, background jobs
  },
};

// Re-export domain types
export type {
  PackType,
  PackItemType,
  PeriodMode,
  VarianceSource,
  PackInstanceStatus,
  PackItemStatus,
  BudgetType,
  CommentaryTargetKind,
  CommentaryType,
  PackDefinition,
  PackItem,
  BudgetLine,
  PackInstance,
  PackInstanceItem,
  ReportCommentary,
  GeneratePackInput,
  ResolvedPeriod,
  // Certification
  CertificationStatus,
  PackCertification,
  // Distribution
  DistributionFormat,
  DistributionStatus,
  RecipientDeliveryStatus,
  PackDistribution,
  PackDistributionRecipient,
  // Activity
  PackActivityType,
  PackActivity,
  // Forecast
  ScenarioType,
  ScenarioStatus,
  ForecastScenario,
  ForecastLine,
} from "./domain/types.js";
export { PACK_INSTANCE_TRANSITIONS, CERTIFICATION_TRANSITIONS } from "./domain/types.js";

// Re-export services
export type { PackGenerationService } from "./services/pack-generation-service.js";
export { DefaultPackGenerationService } from "./services/pack-generation-service.js";

export type { PackCertificationService } from "./services/pack-certification-service.js";
export { DefaultPackCertificationService } from "./services/pack-certification-service.js";

export type {
  PackDistributionService,
  CreateDistributionInput,
  RecipientInput,
} from "./services/pack-distribution-service.js";
export { DefaultPackDistributionService } from "./services/pack-distribution-service.js";

// Re-export persistence interfaces
export type {
  PackDefinitionRepo,
  PackInstanceRepo,
  BudgetRepo,
  CommentaryRepo,
} from "./persistence/pack-repo.js";

export type {
  CertificationRepo,
  DistributionRepo,
  PackActivityRepo,
  ForecastRepo,
} from "./persistence/governance-repo.js";
