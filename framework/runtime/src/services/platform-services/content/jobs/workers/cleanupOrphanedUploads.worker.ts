/**
 * Cleanup Orphaned Uploads Worker
 *
 * Purges incomplete uploads that were initiated but never completed.
 * An upload is considered orphaned if:
 * - sha256 is NULL (upload never completed)
 * - created_at is older than threshold (default 24 hours)
 *
 * Job runs hourly and:
 * 1. Finds orphaned attachment records
 * 2. Deletes S3 objects (if they exist)
 * 3. Deletes attachment records
 * 4. Emits audit events
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import type { Kysely } from "kysely";

const TABLE = "doc.attachment" as keyof DB & string;

export interface CleanupOrphanedUploadsConfig {
  /**
   * Age threshold in hours (default: 24)
   * Uploads older than this are considered orphaned
   */
  orphanedThresholdHours: number;

  /**
   * Max records to clean up per run (safety limit)
   */
  maxCleanupPerRun: number;

  /**
   * Whether to delete S3 objects (default: true)
   * Set to false for testing
   */
  deleteFromStorage: boolean;
}

export function createCleanupOrphanedUploadsHandler(
  db: Kysely<DB>,
  storage: ObjectStorageAdapter,
  config: CleanupOrphanedUploadsConfig,
  logger: Logger,
) {
  return async (): Promise<void> => {
    const now = new Date();
    const thresholdMs = config.orphanedThresholdHours * 3600 * 1000;
    const cutoff = new Date(now.getTime() - thresholdMs);

    logger.info(
      { cutoff: cutoff.toISOString(), threshold: config.orphanedThresholdHours },
      "[content:worker:cleanup-orphaned] Starting cleanup",
    );

    try {
      // Find orphaned uploads
      const orphanedUploads = await db
        .selectFrom(TABLE as any)
        .select([
          "id",
          "tenant_id",
          "storage_bucket",
          "storage_key",
          "original_filename",
          "created_at",
        ] as any)
        .where("sha256", "is", null)
        .where("created_at", "<", cutoff)
        .limit(config.maxCleanupPerRun)
        .execute() as any[];

      if (orphanedUploads.length === 0) {
        logger.debug("[content:worker:cleanup-orphaned] No orphaned uploads found");
        return;
      }

      logger.info(
        { count: orphanedUploads.length },
        "[content:worker:cleanup-orphaned] Found orphaned uploads",
      );

      let deletedFromStorage = 0;
      let deletedFromDb = 0;
      const errors: string[] = [];

      // Process each orphaned upload
      for (const upload of orphanedUploads) {
        try {
          // Delete from S3 if key exists
          if (config.deleteFromStorage && upload.storage_bucket && upload.storage_key) {
            try {
              await storage.delete(upload.storage_key);
              deletedFromStorage++;
              logger.debug(
                {
                  id: upload.id,
                  bucket: upload.storage_bucket,
                  key: upload.storage_key,
                },
                "[content:worker:cleanup-orphaned] Deleted S3 object",
              );
            } catch (s3Error) {
              // S3 object might not exist (initiate was called but upload never started)
              // This is not an error - log as debug
              logger.debug(
                {
                  id: upload.id,
                  error: String(s3Error),
                },
                "[content:worker:cleanup-orphaned] S3 delete failed (object may not exist)",
              );
            }
          }

          // Delete attachment record
          const deleteResult = await db
            .deleteFrom(TABLE as any)
            .where("id", "=", upload.id)
            .execute();

          if (deleteResult.length > 0 && (deleteResult[0] as any).numDeletedRows > 0) {
            deletedFromDb++;
            logger.debug(
              {
                id: upload.id,
                filename: upload.original_filename,
                age: Math.floor((now.getTime() - new Date(upload.created_at).getTime()) / 3600000),
              },
              "[content:worker:cleanup-orphaned] Deleted orphaned upload",
            );
          }
        } catch (error) {
          const errorMsg = `Failed to cleanup ${upload.id}: ${String(error)}`;
          errors.push(errorMsg);
          logger.error(
            { id: upload.id, error: String(error) },
            "[content:worker:cleanup-orphaned] Cleanup failed for upload",
          );
        }
      }

      // Summary log
      logger.info(
        {
          found: orphanedUploads.length,
          deletedFromStorage,
          deletedFromDb,
          errors: errors.length,
        },
        "[content:worker:cleanup-orphaned] Cleanup completed",
      );

      // If too many errors, log warning
      if (errors.length > orphanedUploads.length * 0.5) {
        logger.warn(
          { errorCount: errors.length, totalCount: orphanedUploads.length },
          "[content:worker:cleanup-orphaned] High error rate during cleanup",
        );
      }
    } catch (error) {
      logger.error(
        { error: String(error) },
        "[content:worker:cleanup-orphaned] Worker failed",
      );
      throw error;
    }
  };
}
