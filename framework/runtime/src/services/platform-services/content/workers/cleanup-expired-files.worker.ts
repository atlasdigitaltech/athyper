/**
 * CleanupExpiredFilesWorker - Background job to delete expired files
 *
 * Schedule: Daily at 2 AM
 * Function: Finds files past their expiration date and deletes them
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { ExpiryService } from "../domain/services/ExpiryService.js";

export interface CleanupExpiredFilesJobData {
  tenantId: string;
  batchSize?: number;
}

export function createCleanupExpiredFilesHandler(container: Container) {
  return async (job: any) => {
    const logger = await container.resolve<Logger>(TOKENS.logger);
    const expiryService = await container.resolve<ExpiryService>(TOKENS.expiryService);

    const { tenantId, batchSize = 100 } = job.data as CleanupExpiredFilesJobData;

    logger.info(
      { tenantId, batchSize },
      "[worker:cleanup-expired-files] Starting expired files cleanup job"
    );

    try {
      const result = await expiryService.processExpiredFiles({
        tenantId,
        batchSize,
      });

      logger.info(
        {
          tenantId,
          processed: result.processed,
          deleted: result.deleted,
          failed: result.failed,
        },
        "[worker:cleanup-expired-files] Expired files cleanup complete"
      );

      return {
        success: true,
        processed: result.processed,
        deleted: result.deleted,
        failed: result.failed,
      };
    } catch (error: any) {
      logger.error(
        { tenantId, error: error.message },
        "[worker:cleanup-expired-files] Expired files cleanup failed"
      );

      throw error;
    }
  };
}
