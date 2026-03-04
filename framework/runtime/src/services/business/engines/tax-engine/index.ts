// framework/runtime/src/services/business/engines/tax-engine/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const taxEngineModule: RuntimeModule = {
  name: "engine.tax",

  register(c: Container) {
    // Register tax repositories and services
  },

  contribute(c: Container) {
    // Register health checks
  },
};

// Re-export domain types
export type {
  TaxJurisdiction,
  CreateTaxJurisdictionInput,
  JurisdictionType,
  TaxType,
  TaxRate,
  CreateTaxRateInput,
  TaxCalculation,
  CalculateTaxInput,
  TaxCalculationResult,
  TaxCreditLedger,
} from "./domain/types.js";

// Re-export services
export type { TaxCalculationService } from "./services/tax-calculation-service.js";
export { DefaultTaxCalculationService } from "./services/tax-calculation-service.js";

// Re-export persistence
export type { TaxJurisdictionRepo } from "./persistence/tax-jurisdiction-repo.js";
export type { TaxRateRepo } from "./persistence/tax-rate-repo.js";
export type { TaxCalculationRepo } from "./persistence/tax-calculation-repo.js";
export type { TaxCreditLedgerRepo } from "./persistence/tax-credit-ledger-repo.js";

// Re-export domain logic
export { calculateTax, aggregateTaxResults } from "./domain/tax-calculator.js";
