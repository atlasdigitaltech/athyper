// framework/runtime/src/services/business/engines/federation-engine/persistence/ic-transaction-repo.ts

import type { PaginationParams, PaginatedResult } from "../../shared/engine-base.js";
import type { IntercompanyTransaction, CreateICTransactionInput, ICTxnStatus } from "../domain/types.js";

export interface ICTransactionRepo {
    create(input: CreateICTransactionInput): Promise<IntercompanyTransaction>;
    getById(tenantId: string, id: string): Promise<IntercompanyTransaction | null>;
    updateStatus(tenantId: string, id: string, status: ICTxnStatus, updates?: Partial<IntercompanyTransaction>): Promise<IntercompanyTransaction>;
    list(tenantId: string, filters: {
        sourceEntityCode?: string;
        destEntityCode?: string;
        status?: ICTxnStatus;
    }, pagination: PaginationParams): Promise<PaginatedResult<IntercompanyTransaction>>;
    getUnnetted(tenantId: string, entityPair: string): Promise<IntercompanyTransaction[]>;
}
