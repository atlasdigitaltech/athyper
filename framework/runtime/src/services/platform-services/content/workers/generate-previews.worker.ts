/**
 * GeneratePreviewsWorker - Background job to generate missing previews
 *
 * Schedule: Every 5 minutes
 * Function: Finds attachments without previews and generates them
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { PreviewService } from "../domain/services/PreviewService.js";

export interface GeneratePreviewsJobData {
  tenantId: string;
  batchSize?: number;
}

export function createGeneratePreviewsHandler(container: Container) {
  return async (job: any) => {
    const logger = await container.resolve<Logger>(TOKENS.logger);
    const previewService = await container.resolve<PreviewService>(
      TOKENS.previewService,
    );

    const { tenantId, batchSize = 10 } = job.data as GeneratePreviewsJobData;

    logger.info(
      { tenantId, batchSize },
      "[worker:generate-previews] Starting preview generation job",
    );

    try {
      const count = await previewService.generateMissingPreviews(
        tenantId,
        batchSize,
      );

      logger.info(
        { tenantId, generated: count },
        "[worker:generate-previews] Preview generation complete",
      );

      return { success: true, generated: count };
    } catch (error: any) {
      logger.error(
        { tenantId, error: error.message },
        "[worker:generate-previews] Preview generation failed",
      );

      throw error;
    }
  };
}
