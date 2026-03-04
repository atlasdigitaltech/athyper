/**
 * AccessLogService - File access audit trail service
 *
 * Purpose: Track all file access for security and compliance
 * Features:
 * - Async logging (non-blocking)
 * - Batch processing for performance
 * - Query capabilities for audit reports
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { AccessLogRepo } from "../../persistence/AccessLogRepo.js";

export interface LogAccessParams {
  tenantId: string;
  attachmentId: string;
  actorId: string;
  action: "download" | "preview" | "metadata";
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessStatsResult {
  totalAccesses: number;
  downloadCount: number;
  previewCount: number;
  metadataCount: number;
  uniqueActors: number;
  lastAccessedAt: Date | null;
}

export class AccessLogService {
  private logQueue: LogAccessParams[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds

  constructor(
    private accessLogRepo: AccessLogRepo,
    private logger: Logger,
  ) {
    // Start auto-flush timer
    this.startAutoFlush();
  }

  /**
   * Log file access (async, batched)
   */
  async logAccess(params: LogAccessParams): Promise<void> {
    try {
      // Add to queue
      this.logQueue.push(params);

      // If queue is full, flush immediately
      if (this.logQueue.length >= this.BATCH_SIZE) {
        await this.flush();
      }
    } catch (error) {
      // Don't fail the main operation if logging fails
      this.logger.error(
        { error: String(error), attachmentId: params.attachmentId },
        "[access-log] Failed to queue access log",
      );
    }
  }

  /**
   * Log file access (sync - for immediate logging)
   */
  async logAccessSync(params: LogAccessParams): Promise<void> {
    try {
      await this.accessLogRepo.create(params);

      this.logger.debug(
        { attachmentId: params.attachmentId, action: params.action },
        "[access-log] Access logged",
      );
    } catch (error) {
      this.logger.error(
        { error: String(error), attachmentId: params.attachmentId },
        "[access-log] Failed to log access",
      );
    }
  }

  /**
   * Flush queued logs to database
   */
  async flush(): Promise<void> {
    if (this.logQueue.length === 0) return;

    const batch = this.logQueue.splice(0, this.BATCH_SIZE);

    try {
      await this.accessLogRepo.createBatch(batch);

      this.logger.debug(
        { count: batch.length },
        "[access-log] Flushed access logs",
      );
    } catch (error) {
      this.logger.error(
        { error: String(error), count: batch.length },
        "[access-log] Failed to flush access logs",
      );
    }
  }

  /**
   * Get access history for an attachment
   */
  async getAccessHistory(
    tenantId: string,
    attachmentId: string,
    options?: { limit?: number; startDate?: Date; endDate?: Date },
  ) {
    return this.accessLogRepo.query({
      tenantId,
      attachmentId,
      limit: options?.limit,
      startDate: options?.startDate,
      endDate: options?.endDate,
    });
  }

  /**
   * Get access statistics for an attachment
   */
  async getAccessStats(
    tenantId: string,
    attachmentId: string,
  ): Promise<AccessStatsResult> {
    const stats = await this.accessLogRepo.getStats(tenantId, attachmentId);

    const downloadCount =
      stats.find((s) => s.action === "download")?.count ?? 0;
    const previewCount = stats.find((s) => s.action === "preview")?.count ?? 0;
    const metadataCount =
      stats.find((s) => s.action === "metadata")?.count ?? 0;

    // Get last access time
    const history = await this.accessLogRepo.query({
      tenantId,
      attachmentId,
      limit: 1,
    });

    return {
      totalAccesses: downloadCount + previewCount + metadataCount,
      downloadCount,
      previewCount,
      metadataCount,
      uniqueActors: 0, // TODO: Implement unique actor count query
      lastAccessedAt: history.length > 0 ? history[0].accessedAt : null,
    };
  }

  /**
   * Get recent access by actor
   */
  async getRecentAccessByActor(tenantId: string, actorId: string, limit = 50) {
    return this.accessLogRepo.getRecentByActor(tenantId, actorId, limit);
  }

  /**
   * Cleanup old logs (for retention policy)
   */
  async cleanupOldLogs(
    tenantId: string,
    retentionDays: number,
  ): Promise<number> {
    const beforeDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    this.logger.info(
      { tenantId, retentionDays, beforeDate },
      "[access-log] Starting cleanup",
    );

    let totalDeleted = 0;
    let batchDeleted = 0;

    do {
      batchDeleted = await this.accessLogRepo.deleteOlderThan(
        tenantId,
        beforeDate,
        10000,
      );
      totalDeleted += batchDeleted;

      this.logger.debug(
        { batchDeleted, totalDeleted },
        "[access-log] Cleanup batch complete",
      );

      // Small delay between batches to avoid overwhelming DB
      if (batchDeleted > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } while (batchDeleted > 0);

    this.logger.info({ totalDeleted }, "[access-log] Cleanup complete");

    return totalDeleted;
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    this.flushInterval = setInterval(() => {
      if (this.logQueue.length > 0) {
        this.flush().catch((err) => {
          this.logger.error(
            { error: String(err) },
            "[access-log] Auto-flush failed",
          );
        });
      }
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Stop auto-flush timer (for cleanup)
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    await this.flush();
  }
}
