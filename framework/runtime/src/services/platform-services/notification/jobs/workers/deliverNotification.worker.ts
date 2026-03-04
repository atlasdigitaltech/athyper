/**
 * deliverNotification.worker — BullMQ job handler for the delivery phase.
 *
 * Loads the delivery row, resolves + renders the template,
 * calls the channel adapter, and updates status.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { NotificationOrchestrator, DeliverNotificationPayload } from "../../domain/services/NotificationOrchestrator.js";
import type { Job, JobHandler } from "@athyper/core";

export function createDeliverNotificationHandler(
    orchestrator: NotificationOrchestrator,
    logger: Logger,
): JobHandler<DeliverNotificationPayload, void> {
    return async (job: Job<DeliverNotificationPayload>): Promise<void> => {
        const { payload } = job.data;

        logger.debug(
            {
                jobId: job.id,
                deliveryId: payload.deliveryId,
                channel: payload.channel,
                attempt: job.attempts,
            },
            "[notify:worker:deliver] Processing delivery job",
        );

        try {
            await orchestrator.executeDelivery(payload);

            logger.debug(
                { jobId: job.id, deliveryId: payload.deliveryId },
                "[notify:worker:deliver] Delivery complete",
            );
        } catch (err) {
            logger.error(
                {
                    jobId: job.id,
                    deliveryId: payload.deliveryId,
                    channel: payload.channel,
                    error: String(err),
                    attempt: job.attempts,
                    maxAttempts: job.maxAttempts,
                },
                "[notify:worker:deliver] Delivery failed",
            );
            throw err; // BullMQ will retry on transient failures
        }
    };
}
