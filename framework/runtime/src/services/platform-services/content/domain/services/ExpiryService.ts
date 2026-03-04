/**
 * ExpiryService - Manage expiring/temporary files
 *
 * Use cases:
 * - Temporary exports (expire after 24 hours)
 * - Shared links with expiration
 * - Auto-cleanup of old files
 *
 * Process:
 * - Set expires_at on attachment
 * - Background job checks expired files daily
 * - Delete from S3 + mark attachment deleted
 */

import type { ContentAuditEmitter } from "./ContentAuditEmitter";
import type { Logger } from "../../../../../kernel/logger";
import type { AttachmentRepo } from "../../persistence/AttachmentRepo";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";

export interface SetExpirationParams {
  tenantId: string;
  attachmentId: string;
  expiresAt: Date;
  actorId: string;
}

export interface ClearExpirationParams {
  tenantId: string;
  attachmentId: string;
  actorId: string;
}

export interface ProcessExpiredFilesParams {
  tenantId: string;
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 100;

export class ExpiryService {
  constructor(
    private attachmentRepo: AttachmentRepo,
    private storage: ObjectStorageAdapter,
    private audit: ContentAuditEmitter,
    private logger: Logger,
  ) {}

  /**
   * Set expiration date on an attachment
   */
  async setExpiration(params: SetExpirationParams) {
    const { tenantId, attachmentId, expiresAt, actorId } = params;

    // Get attachment
    const attachment = await this.attachmentRepo.getById(
      attachmentId,
      tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // Validate expiration is in the future
    const now = new Date();
    if (expiresAt <= now) {
      throw new Error("Expiration date must be in the future");
    }

    // Update attachment
    await this.attachmentRepo.update(attachmentId, tenantId, {
      expiresAt,
    } as any);

    // Emit audit event (best-effort)
    await (this.audit as any)
      .expirationSet?.({
        tenantId,
        actorId,
        attachmentId,
        metadata: {
          expiresAt: expiresAt.toISOString(),
          ttlSeconds: Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
        },
      })
      .catch?.(() => {});

    this.logger.info(
      { attachmentId, expiresAt },
      "[ExpiryService] Expiration set",
    );

    return {
      attachmentId,
      expiresAt,
    };
  }

  /**
   * Clear expiration (make file permanent)
   */
  async clearExpiration(params: ClearExpirationParams) {
    const { tenantId, attachmentId, actorId } = params;

    // Get attachment
    const attachment = await this.attachmentRepo.getById(
      attachmentId,
      tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // Update attachment
    await this.attachmentRepo.update(attachmentId, tenantId, {
      expiresAt: null,
    } as any);

    // Emit audit event (best-effort)
    await (this.audit as any)
      .expirationCleared?.({
        tenantId,
        actorId,
        attachmentId,
        metadata: {
          previousExpiresAt:
            (attachment as any).expiresAt?.toISOString() ?? null,
        },
      })
      .catch?.(() => {});

    this.logger.info({ attachmentId }, "[ExpiryService] Expiration cleared");

    return {
      attachmentId,
    };
  }

  /**
   * Get expiration info for an attachment
   */
  async getExpiration(attachmentId: string, tenantId: string) {
    const attachment = await this.attachmentRepo.getById(
      attachmentId,
      tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    const attachmentExpiresAt = (attachment as any).expiresAt as Date | null;
    if (!attachmentExpiresAt) {
      return {
        attachmentId,
        expiresAt: null,
        isExpired: false,
        ttlSeconds: null,
      };
    }

    const now = new Date();
    const isExpired = attachmentExpiresAt <= now;
    const ttlSeconds = isExpired
      ? 0
      : Math.floor((attachmentExpiresAt.getTime() - now.getTime()) / 1000);

    return {
      attachmentId,
      expiresAt: attachmentExpiresAt,
      isExpired,
      ttlSeconds,
    };
  }

  /**
   * Process expired files (delete from S3 and database)
   */
  async processExpiredFiles(params: ProcessExpiredFilesParams): Promise<{
    processed: number;
    deleted: number;
    failed: number;
  }> {
    const { tenantId, batchSize = DEFAULT_BATCH_SIZE } = params;

    const now = new Date();
    let processed = 0;
    let deleted = 0;
    let failed = 0;

    try {
      // Find expired attachments (using repo with as any for missing method)
      const expiredAttachments: any[] =
        (await (this.attachmentRepo as any).findExpired?.(
          tenantId,
          now,
          batchSize,
        )) ?? [];

      this.logger.info(
        { tenantId, expiredCount: expiredAttachments.length },
        "[ExpiryService] Processing expired files",
      );

      for (const attachment of expiredAttachments) {
        processed++;

        try {
          // Delete from S3
          await this.storage.delete(attachment.storageKey);

          // Delete thumbnail and preview if exist
          if (attachment.thumbnailKey) {
            await this.storage.delete(attachment.thumbnailKey);
          }
          if (attachment.previewKey) {
            await this.storage.delete(attachment.previewKey);
          }

          // Delete from database
          await this.attachmentRepo.delete(attachment.id, tenantId, "system");

          // Emit audit event (best-effort)
          await (this.audit as any)
            .fileExpired?.({
              tenantId,
              actorId: "system",
              attachmentId: attachment.id,
              metadata: {
                fileName: attachment.fileName,
                sizeBytes: attachment.sizeBytes,
                expiresAt: attachment.expiresAt?.toISOString() ?? null,
                ownerEntity: attachment.ownerEntity,
                ownerEntityId: attachment.ownerEntityId,
              },
            })
            .catch?.(() => {});

          deleted++;

          this.logger.info(
            { attachmentId: attachment.id, fileName: attachment.fileName },
            "[ExpiryService] Expired file deleted",
          );
        } catch (error: any) {
          failed++;

          this.logger.error(
            { attachmentId: attachment.id, error: error.message },
            "[ExpiryService] Failed to delete expired file",
          );
        }
      }

      this.logger.info(
        { tenantId, processed, deleted, failed },
        "[ExpiryService] Expired files processing completed",
      );

      return { processed, deleted, failed };
    } catch (error: any) {
      this.logger.error(
        { tenantId, error: error.message },
        "[ExpiryService] Failed to process expired files",
      );

      throw error;
    }
  }

  /**
   * List files expiring soon (for notification)
   */
  async listExpiringFiles(
    tenantId: string,
    withinHours: number,
    limit: number = 50,
  ) {
    const now = new Date();
    const expiryThreshold = new Date(
      now.getTime() + withinHours * 60 * 60 * 1000,
    );

    // Get all attachments with expiration set (using as any for missing method)
    const attachments: any[] =
      (await (this.attachmentRepo as any).listByOwner?.(
        tenantId,
        "any",
        "any",
        limit,
      )) ?? [];

    // Filter to those expiring soon
    const expiringSoon = attachments.filter((a: any) => {
      if (!a.expiresAt) return false;
      return a.expiresAt > now && a.expiresAt <= expiryThreshold;
    });

    return expiringSoon.map((a: any) => ({
      attachmentId: a.id,
      fileName: a.fileName,
      expiresAt: a.expiresAt,
      ttlSeconds: Math.floor((a.expiresAt!.getTime() - now.getTime()) / 1000),
      ownerEntity: a.ownerEntity,
      ownerEntityId: a.ownerEntityId,
    }));
  }

  /**
   * Set expiration from TTL (convenience method)
   */
  async setExpirationFromTtl(
    tenantId: string,
    attachmentId: string,
    ttlSeconds: number,
    actorId: string,
  ) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    return this.setExpiration({
      tenantId,
      attachmentId,
      expiresAt,
      actorId,
    });
  }

  /**
   * Extend expiration (add more time)
   */
  async extendExpiration(
    tenantId: string,
    attachmentId: string,
    additionalSeconds: number,
    actorId: string,
  ) {
    // Get current attachment
    const attachment = await this.attachmentRepo.getById(
      attachmentId,
      tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    const currentExpiresAt = (attachment as any).expiresAt as Date | null;
    if (!currentExpiresAt) {
      throw new Error("Attachment has no expiration set");
    }

    // Calculate new expiration
    const newExpiresAt = new Date(
      currentExpiresAt.getTime() + additionalSeconds * 1000,
    );

    return this.setExpiration({
      tenantId,
      attachmentId,
      expiresAt: newExpiresAt,
      actorId,
    });
  }

  /**
   * Get statistics on expiring files
   */
  async getExpiryStats(tenantId: string) {
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const allAttachments: any[] =
      (await (this.attachmentRepo as any).listByOwner?.(
        tenantId,
        "any",
        "any",
        10000,
      )) ?? [];

    const withExpiration = allAttachments.filter(
      (a: any) => a.expiresAt !== null,
    );
    const expired = withExpiration.filter((a: any) => a.expiresAt! <= now);
    const expiringIn24h = withExpiration.filter(
      (a: any) => a.expiresAt! > now && a.expiresAt! <= oneDayFromNow,
    );
    const expiringIn7d = withExpiration.filter(
      (a: any) => a.expiresAt! > now && a.expiresAt! <= oneWeekFromNow,
    );

    return {
      totalWithExpiration: withExpiration.length,
      expired: expired.length,
      expiringIn24h: expiringIn24h.length,
      expiringIn7d: expiringIn7d.length,
    };
  }
}
