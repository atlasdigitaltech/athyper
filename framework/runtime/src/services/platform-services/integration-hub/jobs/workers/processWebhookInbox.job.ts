/**
 * Worker — processes inbound webhook events.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { EventGateway, DomainEvent } from "../../domain/services/EventGateway.js";
import type { WebhookEventRepo } from "../../persistence/WebhookEventRepo.js";
import type { Job } from "@athyper/core";

export interface ProcessWebhookPayload {
    tenantId?: string;
    batchSize?: number;
}

export function createProcessWebhookHandler(
    eventRepo: WebhookEventRepo,
    eventGateway: EventGateway,
    logger: Logger,
) {
    return async (job: Job<ProcessWebhookPayload>): Promise<void> => {
        const payload = job.data.payload;
        const batchSize = payload.batchSize ?? 10;

        logger.debug({ batchSize }, "[int:worker:webhook] Processing webhook inbox");

        const events = await eventRepo.claimPending(batchSize, `webhook-worker-${process.pid}`);

        for (const event of events) {
            try {
                // Convert webhook event into a domain event for the gateway
                const domainEvent: DomainEvent = {
                    eventType: event.eventType,
                    entityType: "webhook",
                    entityId: event.subscriptionId,
                    payload: event.payload,
                    createdBy: "webhook-inbound",
                };

                await eventGateway.handleDomainEvent(event.tenantId, domainEvent);
                await eventRepo.markProcessed(event.tenantId, event.id);

                logger.debug(
                    { eventId: event.id, eventType: event.eventType },
                    "[int:worker:webhook] Event processed",
                );
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                await eventRepo.updateStatus(event.tenantId, event.id, "failed", errorMsg);

                logger.error(
                    { error: errorMsg, eventId: event.id },
                    "[int:worker:webhook] Event processing failed",
                );
            }
        }

        if (events.length > 0) {
            logger.info({ processed: events.length }, "[int:worker:webhook] Batch complete");
        }
    };
}
