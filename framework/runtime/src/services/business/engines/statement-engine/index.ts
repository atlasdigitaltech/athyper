// framework/runtime/src/services/business/engines/statement-engine/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const statementEngineModule: RuntimeModule = {
  name: "engine.statement",

  register(c: Container) {
    // Register statement repositories and services
  },

  contribute(c: Container) {
    // Register health checks, event consumers, background jobs
  },
};

// Re-export domain types
export type {
  StatementType,
  StatementScope,
  StatementLineType,
  AccountMappingMode,
  SignTreatment,
  NormalBalance,
  InstanceStatus,
  StatementDefinition,
  StatementLine,
  CalculationStep,
  StatementLineAccount,
  StatementInstance,
  StatementInstanceLine,
  AccountBreakdownEntry,
  GenerateStatementInput,
  ResolvedAccountBalance,
} from "./domain/types.js";
export { INSTANCE_TRANSITIONS } from "./domain/types.js";

// Re-export services
export type { StatementGenerationService } from "./services/statement-generation-service.js";
export { DefaultStatementGenerationService } from "./services/statement-generation-service.js";

export type {
  StatementComparisonService,
  ComparisonLine,
  StatementComparison,
  CompareInput,
} from "./services/statement-comparison-service.js";
export { DefaultStatementComparisonService } from "./services/statement-comparison-service.js";

// Re-export persistence interfaces
export type {
  StatementDefinitionRepo,
  StatementInstanceRepo,
  AccountResolutionRepo,
} from "./persistence/statement-repo.js";
