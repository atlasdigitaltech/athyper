/**
 * planNotification.worker — BullMQ job handler for the planning phase.
 *
 * Receives a domain event payload, runs the rule engine + recipient resolution
 * + preference/dedup filtering, creates message/delivery rows, and enqueues
 * individual delivery jobs.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
  NotificationOrchestrator,
  PlanNotificationPayload,
} from "../../domain/services/NotificationOrchestrator.js";
import type { Job, JobHandler } from "@athyper/core";

export function createPlanNotificationHandler(
  orchestrator: NotificationOrchestrator,
  logger: Logger,
): JobHandler<PlanNotificationPayload, void> {
  return async (job: Job<PlanNotificationPayload>): Promise<void> => {
    const { payload } = job.data;

    logger.info(
      {
        jobId: job.id,
        eventType: payload.eventType,
        eventId: payload.eventId,
        tenantId: payload.tenantId,
      },
      "[notify:worker:plan] Processing planning job",
    );

    try {
      await orchestrator.planNotification(payload);

      logger.info(
        { jobId: job.id, eventId: payload.eventId },
        "[notify:worker:plan] Planning complete",
      );
    } catch (err) {
      logger.error(
        {
          jobId: job.id,
          eventId: payload.eventId,
          error: String(err),
          attempt: job.attempts,
        },
        "[notify:worker:plan] Planning failed",
      );
      throw err; // BullMQ will retry based on job options
    }
  };
}
