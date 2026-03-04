// framework/runtime/src/services/business/engines/tax-engine/persistence/tax-calculation-repo.ts

import type { TaxCalculation } from "../domain/types.js";

export interface TaxCalculationRepo {
  create(
    calc: Omit<TaxCalculation, "id" | "calculatedAt">,
  ): Promise<TaxCalculation>;
  createBatch(
    calcs: Omit<TaxCalculation, "id" | "calculatedAt">[],
  ): Promise<TaxCalculation[]>;
  getByTxnId(tenantId: string, txnId: string): Promise<TaxCalculation[]>;
  getByDocId(tenantId: string, docId: string): Promise<TaxCalculation[]>;
  getByCommitmentId(
    tenantId: string,
    commitmentId: string,
  ): Promise<TaxCalculation[]>;
}
