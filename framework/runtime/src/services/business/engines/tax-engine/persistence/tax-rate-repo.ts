// framework/runtime/src/services/business/engines/tax-engine/persistence/tax-rate-repo.ts

import type { TaxRate, CreateTaxRateInput, TaxType } from "../domain/types.js";

export interface TaxRateRepo {
  create(input: CreateTaxRateInput): Promise<TaxRate>;
  getById(tenantId: string, id: string): Promise<TaxRate | null>;

  /** Get effective rates for a jurisdiction and tax code on a given date */
  getEffectiveRates(
    tenantId: string,
    jurisdictionId: string,
    taxCode: string,
    asOfDate: Date,
  ): Promise<TaxRate[]>;

  /** Get all rates for a jurisdiction */
  listByJurisdiction(
    tenantId: string,
    jurisdictionId: string,
    filters?: { taxType?: TaxType },
  ): Promise<TaxRate[]>;

  /** Get rates by tax code across all jurisdictions */
  getByTaxCode(
    tenantId: string,
    taxCode: string,
    asOfDate: Date,
  ): Promise<TaxRate[]>;
}
