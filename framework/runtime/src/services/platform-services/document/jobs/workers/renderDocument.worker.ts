/**
 * Render Document Worker — Processes async document render jobs.
 *
 * Job type: "render-document"
 * Payload: { outputId, renderJobId, tenantId, variables }
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DocRenderService } from "../../domain/services/DocRenderService.js";
import type { OutputId, RenderJobId } from "../../domain/types.js";

export interface RenderDocumentPayload {
  outputId: OutputId;
  renderJobId: RenderJobId;
  tenantId: string;
  variables: Record<string, unknown>;
}

export function createRenderDocumentHandler(
  renderService: DocRenderService,
  logger: Logger,
) {
  return async (job: {
    id: string;
    data: { payload: RenderDocumentPayload };
    attempts: number;
  }): Promise<void> => {
    const { payload } = job.data;

    logger.debug(
      { jobId: job.id, outputId: payload.outputId, attempt: job.attempts },
      "[doc:worker:render] Processing render job",
    );

    try {
      await renderService.executeRender(payload.outputId, payload.variables);

      logger.info(
        { jobId: job.id, outputId: payload.outputId },
        "[doc:worker:render] Render completed",
      );
    } catch (error) {
      logger.error(
        {
          jobId: job.id,
          outputId: payload.outputId,
          error: String(error),
          attempt: job.attempts,
        },
        "[doc:worker:render] Render failed",
      );
      throw error;
    }
  };
}
