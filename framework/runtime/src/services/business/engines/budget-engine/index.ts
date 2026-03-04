// framework/runtime/src/services/business/engines/budget-engine/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const budgetEngineModule: RuntimeModule = {
  name: "engine.budget",

  register(c: Container) {
    // Register budget repositories and services
  },

  contribute(c: Container) {
    // Register health checks, event consumers, background jobs
  },
};

// Re-export domain types
export type {
  FundingProfile,
  CreateFundingProfileInput,
  FPLevel,
  FPStatus,
  HealthStatus,
  Trend,
  FundAction,
  FundActionInput,
  FundingTransaction,
  FPStateSnapshot,
  AvailableBalance,
  FundingTransfer,
  CreateTransferInput,
  TransferStatus,
  CarryForwardRule,
  HealthThresholds,
} from "./domain/types.js";
export { DEFAULT_HEALTH_THRESHOLDS } from "./domain/types.js";

// Re-export services
export type { FundLifecycleService } from "./services/fund-lifecycle-service.js";
export { DefaultFundLifecycleService } from "./services/fund-lifecycle-service.js";

// Re-export persistence interfaces
export type { FundingProfileRepo } from "./persistence/funding-profile-repo.js";
export type { FundingTransactionRepo } from "./persistence/funding-transaction-repo.js";
export type { FundingTransferRepo } from "./persistence/funding-transfer-repo.js";

// Re-export domain logic
export {
  calculateHealthStatus,
  calculateAvailableBalance,
  determineTrend,
  wouldBreach,
} from "./domain/health-calculator.js";
export {
  validateChildLimits,
  isParentBlocked,
  canAcceptAction,
} from "./domain/hierarchy-validator.js";
