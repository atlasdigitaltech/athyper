// framework/runtime/src/services/business/engines/budget-engine/persistence/funding-transaction-repo.ts

import type { PaginationParams, PaginatedResult } from "../../shared/engine-base.js";
import type { FundingTransaction, FundAction } from "../domain/types.js";

/**
 * Funding Transaction Repository.
 */
export interface FundingTransactionRepo {
    /** Record a new funding transaction */
    create(txn: Omit<FundingTransaction, "id">): Promise<FundingTransaction>;

    /** Get by ID */
    getById(tenantId: string, id: string): Promise<FundingTransaction | null>;

    /** Check idempotency key */
    existsByIdempotencyKey(idempotencyKey: string): Promise<boolean>;

    /** List transactions for a FP */
    listByFpId(tenantId: string, fpId: string, filters: {
        action?: FundAction;
        fromDate?: Date;
        toDate?: Date;
    }, pagination: PaginationParams): Promise<PaginatedResult<FundingTransaction>>;

    /** List transactions for a transaction pipeline */
    listByTxnId(tenantId: string, txnId: string): Promise<FundingTransaction[]>;

    /** Get expired reservations */
    getExpiredReservations(tenantId: string, cutoffDate: Date): Promise<FundingTransaction[]>;
}
