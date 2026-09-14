import type {
  JobExecutionResult,
  JobHandler,
  JobPublisher,
} from "@athyper/server-contract-jobs";
import type { DocumentExtractionRequest } from "@athyper/server-contract-content-extraction";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { SearchIndex } from "@athyper/server-contract-search";
import {
  DOCUMENT_PROCESSING_QUEUE,
  EXTRACT_AND_INDEX_JOB,
  documentExtractionTimeoutMs,
} from "./document-processing.js";

/**
 * A tenant-scoped sweep: it deliberately never queries every tenant with a
 * service credential. The host schedules one request for each trusted tenant
 * context, preserving the same RLS boundary as normal extraction.
 */
export const RECOVER_PENDING_EXTRACTION_JOB =
  "documents.recover-pending-extractions";
export const REMOVE_DOCUMENT_SEARCH_JOB = "documents.remove-search-index";
export interface SearchRemovalRequest {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly attachmentId: string;
  readonly principalId: string;
  readonly reason: "deactivated" | "quarantined" | "deleted" | "expired";
}
export interface PendingExtractionRecoveryRequest {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly limit?: number;
}
export interface PendingExtractionRepository<T> {
  listPending(
    tenantId: string,
    limit: number,
    transaction: T,
  ): Promise<readonly string[]>;
}
export function createPendingExtractionRecoveryHandler<T>(options: {
  readonly repository: PendingExtractionRepository<T>;
  readonly transactions: PlaneTransactionCoordinator<T>;
  readonly jobs: JobPublisher;
  readonly adapterTimeoutMs: number;
}): JobHandler<
  typeof RECOVER_PENDING_EXTRACTION_JOB,
  PendingExtractionRecoveryRequest
> {
  const timeoutMs = documentExtractionTimeoutMs(options.adapterTimeoutMs);
  return {
    async handle(job): Promise<JobExecutionResult> {
      const request = valid(job.data);
      const ids = await options.transactions.run(
        request.planeKey,
        request,
        (transaction) =>
          options.repository.listPending(
            request.tenantId,
            request.limit ?? 100,
            transaction,
          ),
      );
      for (const attachmentId of ids) {
        const extraction: DocumentExtractionRequest = {
          ...request,
          attachmentId,
        };
        await options.jobs.enqueue(
          DOCUMENT_PROCESSING_QUEUE,
          EXTRACT_AND_INDEX_JOB,
          extraction,
          {
            jobId: `extract-${request.planeKey}-${request.tenantId}-${attachmentId}`,
            maxAttempts: 5,
            timeoutMs,
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );
      }
      return { status: "completed", output: { recovered: ids.length } };
    },
  };
}
export function createSearchRemovalHandler(
  index: SearchIndex,
): JobHandler<typeof REMOVE_DOCUMENT_SEARCH_JOB, SearchRemovalRequest> {
  return {
    async handle(job): Promise<JobExecutionResult> {
      const request = job.data;
      if (
        !/^[0-9a-f-]{36}$/i.test(request.tenantId) ||
        !/^[0-9a-f-]{36}$/i.test(request.attachmentId) ||
        !["deactivated", "quarantined", "deleted", "expired"].includes(
          request.reason,
        )
      )
        throw new Error("Invalid search removal request");
      await index.remove(
        `${request.planeKey}:${request.tenantId}:${request.attachmentId}`,
      );
      return {
        status: "completed",
        output: { attachmentId: request.attachmentId, reason: request.reason },
      };
    },
  };
}
function valid(
  value: PendingExtractionRecoveryRequest,
): PendingExtractionRecoveryRequest {
  if (
    !/^[0-9a-f-]{36}$/i.test(value.tenantId) ||
    !/^[0-9a-f-]{36}$/i.test(value.principalId) ||
    !["studio", "neon", "mesh"].includes(value.planeKey) ||
    (value.limit !== undefined &&
      (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 1000))
  ) {
    throw new Error("Invalid pending-extraction recovery request");
  }
  return value;
}
