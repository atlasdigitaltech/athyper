// framework/runtime/src/services/business/engines/posting-engine/persistence/gl-balance-repo.ts

import type { GLBalance } from "../domain/types";
import type { TransactionContext } from "../services/posting-service";

export interface GLBalanceRepo {
  upsert(balance: Omit<GLBalance, "id" | "updatedAt">): Promise<GLBalance>;
  getByAccount(
    tenantId: string,
    entityCode: string,
    accountId: string,
    fiscalYear: number,
    periodNumber: number,
    costCenterId?: string,
  ): Promise<GLBalance | null>;
  listByPeriod(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<GLBalance[]>;
  listByAccount(
    tenantId: string,
    entityCode: string,
    accountId: string,
    fiscalYear: number,
  ): Promise<GLBalance[]>;

  /** Increment period debits/credits (used when posting JE lines) */
  incrementPeriodAmounts(
    tenantId: string,
    entityCode: string,
    accountId: string,
    fiscalYear: number,
    periodNumber: number,
    costCenterId: string | null,
    currencyCode: string,
    debitDelta: string,
    creditDelta: string,
    tx?: TransactionContext,
    /** Resolved dimension set — new balance grain axis */
    dimensionSetId?: string | null,
  ): Promise<void>;
}
