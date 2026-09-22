import type { AttachmentIdentity } from "@athyper/server-contract-attachments";
import type { JobExecutionResult, JobHandler } from "@athyper/server-contract-jobs";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { AttachmentLifecycle, AttachmentRepository } from "./attachment-lifecycle.js";
import type { AttachmentQuotaLedger } from "./quota.js";

export const ATTACHMENT_MAINTENANCE_QUEUE = "attachments.maintenance";
export const EXPIRE_ATTACHMENT_RESERVATIONS_JOB = "attachments.expire-reservations";
export const EXPIRE_STAGED_ATTACHMENT_JOB = "attachments.expire-staged";
export const PURGE_ATTACHMENT_JOB = "attachments.purge";
export const RECONCILE_ATTACHMENT_RETENTION_JOB =
  "attachments.reconcile-retention";

export interface AttachmentMaintenanceRequest extends AttachmentIdentity {
  readonly [key: string]: unknown;
}
export interface ExpireAttachmentReservationsRequest
{
  readonly planeKey: AttachmentIdentity["planeKey"];
  readonly tenantId: string;
  readonly principalId: string;
  readonly batchSize?: number;
  readonly [key: string]: unknown;
}

export interface AttachmentRetentionReconciliationRequest {
  readonly planeKey: AttachmentIdentity["planeKey"];
  readonly batchSize?: number;
  readonly [key: string]: unknown;
}

/** Repairs reservations missed by an individual delayed-expiry job. */
export function createAttachmentQuotaRecoveryHandler<T>(input: {
  transactions: PlaneTransactionCoordinator<T>;
  quota: AttachmentQuotaLedger<T>;
  attachments: AttachmentRepository<T>;
}): JobHandler<typeof EXPIRE_ATTACHMENT_RESERVATIONS_JOB, ExpireAttachmentReservationsRequest> {
  return {
    async handle(job): Promise<JobExecutionResult> {
      const value = job.data;
      const limit = Math.min(500, Math.max(1, value.batchSize ?? 100));
      const expired = await input.transactions.run(value.planeKey, value, async (tx) => {
        const ids = await input.quota.expire(
          { tenantId: value.tenantId, principalId: value.principalId, limit },
          tx,
        );
        for (const attachmentId of ids)
          await input.attachments.expire({ ...value, attachmentId }, tx);
        return ids;
      });
      return { status: "completed", output: { expired: expired.length } };
    },
  };
}

/** Idempotent delayed expiry for one staged upload. Active uploads are left untouched. */
export function createAttachmentStageExpiryHandler(
  attachments: AttachmentLifecycle,
): JobHandler<typeof EXPIRE_STAGED_ATTACHMENT_JOB, AttachmentMaintenanceRequest> {
  return {
    async handle(job): Promise<JobExecutionResult> {
      await attachments.expire(job.data);
      return { status: "completed", output: { attachmentId: job.data.attachmentId } };
    },
  };
}

/** Purges only after lifecycle retention, legal-hold, and reference checks. */
export function createAttachmentPurgeHandler(
  attachments: AttachmentLifecycle,
): JobHandler<typeof PURGE_ATTACHMENT_JOB, AttachmentMaintenanceRequest> {
  return {
    async handle(job): Promise<JobExecutionResult> {
      const purged = await attachments.purge(job.data);
      return { status: "completed", output: { attachmentId: job.data.attachmentId, purged } };
    },
  };
}

/**
 * Runs the bounded plane reconciliation. Candidate selection is injected so
 * the host can perform its plane-admin query, while each purge remains a
 * tenant-scoped lifecycle command with a deterministic job identity.
 */
export function createAttachmentRetentionReconciliationHandler(input: {
  readonly claim: (
    request: AttachmentRetentionReconciliationRequest,
  ) => Promise<readonly AttachmentMaintenanceRequest[]>;
  readonly schedulePurge: (identity: AttachmentMaintenanceRequest) => Promise<void>;
}): JobHandler<
  typeof RECONCILE_ATTACHMENT_RETENTION_JOB,
  AttachmentRetentionReconciliationRequest
> {
  return {
    async handle(job): Promise<JobExecutionResult> {
      const candidates = await input.claim(job.data);
      for (const candidate of candidates) await input.schedulePurge(candidate);
      return {
        status: "completed",
        output: { examined: candidates.length, enqueued: candidates.length },
      };
    },
  };
}
