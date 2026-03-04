// framework/runtime/src/services/business/engines/tax-engine/persistence/tax-credit-ledger-repo.ts

import type { TaxCreditLedger } from "../domain/types.js";

export interface TaxCreditLedgerRepo {
  upsert(
    tenantId: string,
    entry: Omit<TaxCreditLedger, "id" | "createdAt" | "netPosition">,
  ): Promise<TaxCreditLedger>;
  getByPeriod(
    tenantId: string,
    entityCode: string,
    jurisdictionId: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<TaxCreditLedger | null>;
  listByEntity(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
  ): Promise<TaxCreditLedger[]>;
  markReconciled(tenantId: string, id: string): Promise<void>;
}
