// framework/runtime/src/services/business/engines/posting-engine/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

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
} from "./domain/types.js";
export { PERIOD_TRANSITIONS } from "./domain/types.js";

// Re-export services
export type { PostingService } from "./services/posting-service.js";
export { DefaultPostingService } from "./services/posting-service.js";

// Re-export persistence
export type { JournalEntryRepo } from "./persistence/journal-entry-repo.js";
export type { FiscalPeriodRepo } from "./persistence/fiscal-period-repo.js";
export type { ChartOfAccountsRepo } from "./persistence/chart-of-accounts-repo.js";
export type { GLBalanceRepo } from "./persistence/gl-balance-repo.js";

// Re-export domain logic
export {
  validateDoubleEntry,
  validateJournalLines,
} from "./domain/double-entry-validator.js";
export {
  canPostToPeriod,
  isValidPeriodTransition,
  findPeriodForDate,
} from "./domain/period-control.js";
