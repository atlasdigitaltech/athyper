/**
 * processCallback.worker — BullMQ job handler for provider callback processing.
 *
 * Processes status updates from external providers (e.g., SendGrid event webhooks):
 * delivered, opened, clicked, bounced, dropped, etc.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
  NotificationOrchestrator,
  ProcessCallbackPayload,
} from "../../domain/services/NotificationOrchestrator.js";
import type { Job, JobHandler } from "@athyper/core";

export function createProcessCallbackHandler(
  orchestrator: NotificationOrchestrator,
  logger: Logger,
): JobHandler<ProcessCallbackPayload, void> {
  return async (job: Job<ProcessCallbackPayload>): Promise<void> => {
    const { payload } = job.data;

    logger.debug(
      {
        jobId: job.id,
        provider: payload.provider,
        eventType: payload.eventType,
        externalId: payload.externalId,
      },
      "[notify:worker:callback] Processing provider callback",
    );

    try {
      await orchestrator.processCallback(payload);

      logger.debug(
        { jobId: job.id, externalId: payload.externalId },
        "[notify:worker:callback] Callback processed",
      );
    } catch (err) {
      logger.error(
        {
          jobId: job.id,
          provider: payload.provider,
          externalId: payload.externalId,
          error: String(err),
        },
        "[notify:worker:callback] Callback processing failed",
      );
      throw err;
    }
  };
}
