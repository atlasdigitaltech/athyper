// framework/runtime/src/services/business/engines/federation-engine/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const federationEngineModule: RuntimeModule = {
  name: "engine.federation",

  register(c: Container) {
    // Register federation repositories and services
  },

  contribute(c: Container) {
    // Register FX revaluation jobs, netting proposals, consolidation
  },
};

// Re-export domain types
export type {
  LegalEntity,
  CreateLegalEntityInput,
  EntityType,
  ConsolidationMethod,
  IntercompanyAgreement,
  AgreementType,
  TransferPricingMethod,
  IntercompanyTransaction,
  CreateICTransactionInput,
  ICTxnType,
  ICTxnStatus,
  FxRate,
  CreateFxRateInput,
  FxRateType,
  FxRevaluation,
  ConsolidationElimination,
  EliminationType,
  NettingBatch,
  NettingStatus,
} from "./domain/types.js";

// Re-export services
export type { ICTransactionService } from "./services/ic-transaction-service.js";
export { DefaultICTransactionService } from "./services/ic-transaction-service.js";

// Re-export persistence
export type { LegalEntityRepo } from "./persistence/legal-entity-repo.js";
export type { FxRateRepo } from "./persistence/fx-rate-repo.js";
export type { ICTransactionRepo } from "./persistence/ic-transaction-repo.js";

// Re-export domain logic
export {
  translateAmount,
  translateAmountInverse,
  calculateUnrealizedGainLoss,
  selectRate,
  triangulateRate,
} from "./domain/fx-translator.js";
