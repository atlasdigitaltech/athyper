/**
 * drainAuditOutbox.worker — BullMQ job handler for the audit outbox drain.
 *
 * Picks a batch of pending outbox rows, persists them to
 * core.workflow_event_log via WorkflowAuditRepository,
 * and marks rows as persisted/failed/dead.
 *
 * Dead items (exceeded max_attempts) are moved to the DLQ for
 * operator inspection and replay.
 *
 * Follows the deliverNotification.worker.ts factory pattern.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { AuditDlqManager } from "../../domain/AuditDlqManager.js";
import type { AuditOutboxRepo, AuditOutboxEntry } from "../../persistence/AuditOutboxRepo.js";
import type { WorkflowAuditRepository } from "../../persistence/WorkflowAuditRepository.js";
import type { Job, JobHandler } from "@athyper/core";

// ============================================================================
// Payload
// ============================================================================

export interface DrainAuditOutboxPayload {
  /** Batch size to pick from outbox (default 50) */
  batchSize?: number;
  /** Lock identifier for concurrent workers */
  lockBy?: string;
}

// ============================================================================
// Handler Factory
// ============================================================================

export function createDrainAuditOutboxHandler(
  outboxRepo: AuditOutboxRepo,
  auditRepo: WorkflowAuditRepository,
  logger: Logger,
  dlqManager?: AuditDlqManager,
): JobHandler<DrainAuditOutboxPayload, void> {
  return async (job: Job<DrainAuditOutboxPayload>): Promise<void> => {
    const { payload } = job.data;
    const batchSize = payload.batchSize ?? 50;
    const lockBy = payload.lockBy ?? `drain-worker-${job.id}`;

    logger.debug(
      { jobId: job.id, batchSize, attempt: job.attempts },
      "[audit:worker:drain] Picking outbox batch",
    );

    // 1. Pick a batch of pending/failed items
    let batch: AuditOutboxEntry[];
    try {
      batch = await outboxRepo.pick(batchSize, lockBy);
    } catch (err) {
      logger.error(
        { jobId: job.id, error: String(err) },
        "[audit:worker:drain] Failed to pick outbox batch",
      );
      throw err; // BullMQ will retry
    }

    if (batch.length === 0) {
      logger.debug({ jobId: job.id }, "[audit:worker:drain] No items to process");
      return;
    }

    logger.debug(
      { jobId: job.id, batchSize: batch.length },
      "[audit:worker:drain] Processing outbox batch",
    );

    // 2. Persist each item to the audit table
    const persisted: string[] = [];
    const failed: Array<{ id: string; error: string; entry: AuditOutboxEntry }> = [];

    for (const entry of batch) {
      try {
        await auditRepo.recordEvent(entry.tenantId, {
          ...entry.payload,
          eventType: entry.eventType,
        } as any);

        persisted.push(entry.id);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        failed.push({ id: entry.id, error: errorMessage, entry });

        logger.warn(
          {
            jobId: job.id,
            outboxId: entry.id,
            tenantId: entry.tenantId,
            eventType: entry.eventType,
            error: errorMessage,
          },
          "[audit:worker:drain] Failed to persist audit event",
        );
      }
    }

    // 3. Mark persisted items
    if (persisted.length > 0) {
      try {
        await outboxRepo.markPersisted(persisted);
      } catch (err) {
        logger.error(
          { jobId: job.id, count: persisted.length, error: String(err) },
          "[audit:worker:drain] Failed to mark items as persisted",
        );
        // Don't throw — items are persisted in the audit table, they'll be
        // picked again (idempotent because audit table INSERT uses new UUIDs)
      }
    }

    // 4. Mark failed items (with exponential backoff) or move to DLQ
    for (const { id, error, entry } of failed) {
      try {
        // Check if the entry will exceed max_attempts after this failure
        const nextAttempts = entry.attempts + 1;
        const isExhausted = nextAttempts >= entry.maxAttempts;

        await outboxRepo.markFailed(id, error);

        // Move to DLQ when max attempts exhausted
        if (isExhausted && dlqManager) {
          try {
            await dlqManager.moveToDlq(entry, error, "persist_failure");
          } catch (dlqErr) {
            logger.error(
              { jobId: job.id, outboxId: id, error: String(dlqErr) },
              "[audit:worker:drain] Failed to move item to DLQ",
            );
          }
        }
      } catch (err) {
        logger.error(
          { jobId: job.id, outboxId: id, error: String(err) },
          "[audit:worker:drain] Failed to mark item as failed",
        );
      }
    }

    logger.debug(
      {
        jobId: job.id,
        persisted: persisted.length,
        failed: failed.length,
        total: batch.length,
      },
      "[audit:worker:drain] Batch complete",
    );

    // If all items failed, throw so BullMQ records the job as failed
    if (persisted.length === 0 && failed.length > 0) {
      throw new Error(
        `All ${failed.length} outbox items failed to persist. First error: ${failed[0].error}`,
      );
    }
  };
}
