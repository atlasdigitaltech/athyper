/**
 * CleanupAccessLogsWorker - Background job to cleanup old access logs
 *
 * Schedule: Weekly (Sunday at 1 AM)
 * Function: Deletes access logs older than retention period
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { AccessLogService } from "../domain/services/AccessLogService.js";

export interface CleanupAccessLogsJobData {
  tenantId: string;
  retentionDays?: number;
}

export function createCleanupAccessLogsHandler(container: Container) {
  return async (job: any) => {
    const logger = await container.resolve<Logger>(TOKENS.logger);
    const accessLogService = await container.resolve<AccessLogService>(
      TOKENS.accessLogService,
    );

    const { tenantId, retentionDays = 90 } =
      job.data as CleanupAccessLogsJobData;

    logger.info(
      { tenantId, retentionDays },
      "[worker:cleanup-access-logs] Starting access logs cleanup job",
    );

    try {
      const count = await accessLogService.cleanupOldLogs(
        tenantId,
        retentionDays,
      );

      logger.info(
        {
          tenantId,
          retentionDays,
          deletedCount: count,
        },
        "[worker:cleanup-access-logs] Access logs cleanup complete",
      );

      return {
        success: true,
        deletedCount: count,
      };
    } catch (error: any) {
      logger.error(
        { tenantId, error: error.message },
        "[worker:cleanup-access-logs] Access logs cleanup failed",
      );

      throw error;
    }
  };
}
