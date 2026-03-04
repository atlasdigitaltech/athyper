/**
 * AuditDlqManager — Dead-letter queue management for audit events.
 *
 * Moves permanently failed outbox items to the DLQ, supports inspection,
 * single retry, and bulk replay. Follows DlqManager from notification module.
 */

import type { AuditHashChainService } from "./hash-chain.service.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { AuditDlqRepo } from "../persistence/AuditDlqRepo.js";
import type { AuditOutboxRepo, AuditOutboxEntry } from "../persistence/AuditOutboxRepo.js";
import type { AuditDlqEntry, CreateAuditDlqInput } from "./models/AuditDlqEntry.js";

export class AuditDlqManager {
  constructor(
    private readonly dlqRepo: AuditDlqRepo,
    private readonly outboxRepo: AuditOutboxRepo,
    private readonly hashChain: AuditHashChainService | null,
    private readonly logger: Logger,
  ) {}

  /**
   * Move a failed outbox entry to the dead-letter queue.
   * Called by the drain worker when an entry exceeds max_attempts.
   */
  async moveToDlq(
    outboxEntry: AuditOutboxEntry,
    lastError: string,
    errorCategory?: string,
  ): Promise<AuditDlqEntry> {
    const input: CreateAuditDlqInput = {
      tenantId: outboxEntry.tenantId,
      outboxId: outboxEntry.id,
      eventType: outboxEntry.eventType,
      payload: outboxEntry.payload,
      lastError,
      errorCategory,
      attemptCount: outboxEntry.attempts,
      correlationId: (outboxEntry.payload as any)?.correlation_id ?? undefined,
    };

    const entry = await this.dlqRepo.create(input);

    this.logger.info(
      {
        dlqId: entry.id,
        outboxId: outboxEntry.id,
        eventType: outboxEntry.eventType,
        tenantId: outboxEntry.tenantId,
      },
      "[audit:dlq] Outbox entry moved to DLQ",
    );

    return entry;
  }

  /**
   * List DLQ entries for a tenant.
   */
  async list(
    tenantId: string,
    options?: { eventType?: string; unreplayedOnly?: boolean; limit?: number; offset?: number },
  ): Promise<AuditDlqEntry[]> {
    return this.dlqRepo.list(tenantId, options);
  }

  /**
   * Inspect a single DLQ entry.
   */
  async inspect(tenantId: string, id: string): Promise<AuditDlqEntry | undefined> {
    return this.dlqRepo.getById(tenantId, id);
  }

  /**
   * Retry a single DLQ entry — re-enqueues to outbox and marks replayed.
   * Does NOT delete the DLQ entry (audit trail).
   *
   * After replay, resets the hash chain for the affected tenant so that
   * the re-processed event gets a fresh chain position.
   */
  async retry(tenantId: string, id: string, replayedBy: string): Promise<boolean> {
    const entry = await this.dlqRepo.getById(tenantId, id);
    if (!entry) return false;

    // Re-enqueue to outbox for reprocessing
    await this.outboxRepo.enqueue(
      entry.tenantId,
      entry.eventType,
      entry.payload,
    );

    // Mark as replayed in DLQ (keeps audit trail)
    await this.dlqRepo.markReplayed(tenantId, id, replayedBy);

    // Reset hash chain for tenant to force re-init from DB
    // (the replayed event will get a fresh chain position)
    this.hashChain?.resetTenant(tenantId);

    this.logger.info(
      { dlqId: id, outboxId: entry.outboxId, eventType: entry.eventType },
      "[audit:dlq] DLQ entry replayed",
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
        const ok = await this.retry(tenantId, entry.id, replayedBy);
        if (ok) replayed++;
        else errors++;
      } catch (err) {
        errors++;
        this.logger.warn(
          { dlqId: entry.id, error: String(err) },
          "[audit:dlq] Bulk replay failed for entry",
        );
      }
    }

    this.logger.info(
      { tenantId, replayed, errors },
      "[audit:dlq] Bulk replay complete",
    );

    return { replayed, errors };
  }

  /**
   * Count unreplayed entries for health check / metrics.
   */
  async countUnreplayed(tenantId?: string): Promise<number> {
    if (tenantId) {
      return this.dlqRepo.countUnreplayed(tenantId);
    }
    return this.dlqRepo.countAllUnreplayed();
  }
}
