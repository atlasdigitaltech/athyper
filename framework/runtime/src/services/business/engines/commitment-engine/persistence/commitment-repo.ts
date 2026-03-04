// framework/runtime/src/services/business/engines/commitment-engine/persistence/commitment-repo.ts

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base.js";
import type {
  Commitment,
  CreateCommitmentInput,
  CommitmentStatus,
} from "../domain/types.js";

/**
 * Commitment Repository.
 */
export interface CommitmentRepo {
  create(
    input: CreateCommitmentInput & { docNumber: string },
  ): Promise<Commitment>;
  getById(tenantId: string, id: string): Promise<Commitment | null>;
  getByDocNumber(
    tenantId: string,
    entityCode: string,
    docNumber: string,
  ): Promise<Commitment | null>;
  getByTxnId(tenantId: string, txnId: string): Promise<Commitment | null>;

  updateStatus(
    tenantId: string,
    id: string,
    status: CommitmentStatus,
  ): Promise<Commitment>;
  updateFulfilledAmount(
    tenantId: string,
    id: string,
    fulfilledAmount: string,
  ): Promise<Commitment>;
  updateApproval(
    tenantId: string,
    id: string,
    approvedBy: string,
  ): Promise<Commitment>;

  list(
    tenantId: string,
    filters: {
      entityCode?: string;
      status?: CommitmentStatus;
      ouId?: string;
      vendorId?: string;
      fpId?: string;
      docType?: string;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Commitment>>;

  /** Get commitments expiring within N days */
  getExpiring(tenantId: string, withinDays: number): Promise<Commitment[]>;

  /** Get commitments with auto-renew approaching expiry */
  getAutoRenewCandidates(tenantId: string): Promise<Commitment[]>;
}
