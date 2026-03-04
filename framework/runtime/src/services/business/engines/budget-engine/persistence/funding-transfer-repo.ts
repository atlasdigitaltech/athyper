// framework/runtime/src/services/business/engines/budget-engine/persistence/funding-transfer-repo.ts

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base.js";
import type {
  FundingTransfer,
  CreateTransferInput,
  TransferStatus,
} from "../domain/types.js";

/**
 * Funding Transfer Repository.
 */
export interface FundingTransferRepo {
  create(input: CreateTransferInput): Promise<FundingTransfer>;
  getById(tenantId: string, id: string): Promise<FundingTransfer | null>;
  updateStatus(
    tenantId: string,
    id: string,
    status: TransferStatus,
    approvedBy?: string,
  ): Promise<FundingTransfer>;
  list(
    tenantId: string,
    filters: {
      status?: TransferStatus;
      fromFpId?: string;
      toFpId?: string;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FundingTransfer>>;
}
