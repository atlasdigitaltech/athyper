// framework/runtime/src/services/business/engines/decision-grid/persistence/pipeline-repo.ts

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base.js";
import type {
  TransactionPipeline,
  PipelineStatus,
  PipelineStep,
} from "../domain/types.js";

export interface PipelineRepo {
  create(input: {
    tenantId: string;
    txnId: string;
    docId: string;
    docType: string;
    ouId: string;
    submittedBy: string;
  }): Promise<TransactionPipeline>;

  getById(tenantId: string, id: string): Promise<TransactionPipeline | null>;
  getByTxnId(
    tenantId: string,
    txnId: string,
  ): Promise<TransactionPipeline | null>;

  updateStep(
    tenantId: string,
    id: string,
    step: PipelineStep,
    status: PipelineStatus,
    updates: Partial<TransactionPipeline>,
  ): Promise<TransactionPipeline>;
  updateStatus(
    tenantId: string,
    id: string,
    status: PipelineStatus,
  ): Promise<TransactionPipeline>;

  list(
    tenantId: string,
    filters: {
      status?: PipelineStatus;
      ouId?: string;
      submittedBy?: string;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<TransactionPipeline>>;

  /** Get pipelines stuck beyond SLA */
  getTimedOut(
    tenantId: string,
    slaHours: number,
  ): Promise<TransactionPipeline[]>;
}
