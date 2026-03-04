/**
 * CleanupStaleMultipartWorker - Background job to cleanup stale multipart uploads
 *
 * Schedule: Daily at 3 AM
 * Function: Finds expired/abandoned multipart uploads and cleans them up
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { MultipartUploadService } from "../domain/services/MultipartUploadService.js";

export interface CleanupStaleMultipartJobData {
  tenantId: string;
}

export function createCleanupStaleMultipartHandler(container: Container) {
  return async (job: any) => {
    const logger = await container.resolve<Logger>(TOKENS.logger);
    const multipartService = await container.resolve<MultipartUploadService>(
      TOKENS.multipartUploadService
    );

    const { tenantId } = job.data as CleanupStaleMultipartJobData;

    logger.info(
      { tenantId },
      "[worker:cleanup-stale-multipart] Starting stale multipart cleanup job"
    );

    try {
      // Cleanup expired uploads
      const expiredCount = await multipartService.cleanupExpiredUploads(tenantId);

      // Cleanup old completed/aborted records (older than 30 days)
      const oldRecordsCount = await multipartService.cleanupOldRecords(tenantId, 30);

      logger.info(
        {
          tenantId,
          expiredCount,
          oldRecordsCount,
        },
        "[worker:cleanup-stale-multipart] Stale multipart cleanup complete"
      );

      return {
        success: true,
        expiredUploadsDeleted: expiredCount,
        oldRecordsDeleted: oldRecordsCount,
      };
    } catch (error: any) {
      logger.error(
        { tenantId, error: error.message },
        "[worker:cleanup-stale-multipart] Stale multipart cleanup failed"
      );

      throw error;
    }
  };
}
