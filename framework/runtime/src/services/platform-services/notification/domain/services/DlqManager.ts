/**
 * DlqManager — Dead-letter queue management.
 *
 * Moves permanently failed deliveries to the DLQ, supports inspection,
 * single retry, and bulk replay.
 */

import type { DeliverNotificationPayload } from "./NotificationOrchestrator.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { NotificationDlqRepo } from "../../persistence/NotificationDlqRepo.js";
import type {
  NotificationDlqEntry,
  CreateDlqEntryInput,
} from "../models/NotificationDlqEntry.js";
import type { JobQueue, JobData, JobOptions } from "@athyper/core";

export class DlqManager {
  constructor(
    private readonly dlqRepo: NotificationDlqRepo,
    private readonly jobQueue: JobQueue,
    private readonly logger: Logger,
  ) {}

  /**
   * Move a failed delivery to the dead-letter queue.
   * Stores the full delivery payload for later replay.
   */
  async moveToDlq(
    deliveryPayload: DeliverNotificationPayload,
    lastError: string,
    errorCategory: string,
    attemptCount: number,
  ): Promise<NotificationDlqEntry> {
    const input: CreateDlqEntryInput = {
      tenantId: deliveryPayload.tenantId,
      deliveryId: deliveryPayload.deliveryId,
      messageId: deliveryPayload.messageId,
      channel: deliveryPayload.channel as any,
      providerCode: deliveryPayload.providerCode,
      recipientId: deliveryPayload.recipientId,
      recipientAddr: deliveryPayload.recipientAddr,
      lastError,
      errorCategory: errorCategory as any,
      attemptCount,
      payload: deliveryPayload as unknown as Record<string, unknown>,
      metadata: deliveryPayload.metadata,
    };

    const entry = await this.dlqRepo.create(input);

    this.logger.info(
      {
        dlqId: entry.id,
        deliveryId: deliveryPayload.deliveryId,
        channel: deliveryPayload.channel,
      },
      "[notify:dlq] Delivery moved to DLQ",
    );

    return entry;
  }

  /**
   * List DLQ entries for a tenant.
   */
  async list(
    tenantId: string,
    options?: {
      channel?: string;
      unreplayedOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<NotificationDlqEntry[]> {
    return this.dlqRepo.list(tenantId, options);
  }

  /**
   * Inspect a single DLQ entry.
   */
  async inspect(
    tenantId: string,
    id: string,
  ): Promise<NotificationDlqEntry | undefined> {
    return this.dlqRepo.getById(tenantId, id);
  }

  /**
   * Retry a single DLQ entry — clears dedup key, re-enqueues delivery job.
   * Does NOT delete the DLQ entry (audit trail).
   */
  async retry(
    tenantId: string,
    id: string,
    replayedBy: string,
  ): Promise<boolean> {
    const entry = await this.dlqRepo.getById(tenantId, id);
    if (!entry) return false;

    // Re-enqueue the original delivery job
    const jobData: JobData<DeliverNotificationPayload> = {
      type: "deliver-notification",
      payload: entry.payload as unknown as DeliverNotificationPayload,
    };

    const jobOptions: JobOptions = {
      priority: "normal",
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
    };

    await this.jobQueue.add(jobData, jobOptions);

    // Mark as replayed
    await this.dlqRepo.markReplayed(tenantId, id, replayedBy);

    this.logger.info(
      { dlqId: id, deliveryId: entry.deliveryId },
      "[notify:dlq] DLQ entry replayed",
    );

    return true;
  }

  /**
   * Bulk replay — replays all unreplayed entries for a tenant (up to limit).
   */
  async bulkReplay(
    tenantId: string,
    replayedBy: string,
    limit: number = 100,
  ): Promise<{ replayed: number; errors: number }> {
    const entries = await this.dlqRepo.list(tenantId, {
      unreplayedOnly: true,
      limit,
    });

    let replayed = 0;
    let errors = 0;

    for (const entry of entries) {
      try {
        const ok = await this.retry(
          tenantId,
          entry.id as unknown as string,
          replayedBy,
        );
        if (ok) replayed++;
        else errors++;
      } catch (err) {
        errors++;
        this.logger.warn(
          { dlqId: entry.id, error: String(err) },
          "[notify:dlq] Bulk replay failed for entry",
        );
      }
    }

    this.logger.info(
      { tenantId, replayed, errors },
      "[notify:dlq] Bulk replay complete",
    );

    return { replayed, errors };
  }
}
