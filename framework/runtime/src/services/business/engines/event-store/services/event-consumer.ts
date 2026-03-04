// framework/runtime/src/services/business/engines/event-store/services/event-consumer.ts

import type { UniversalEventEnvelope, PartitionDomain } from "../domain/types.js";
import type { CheckpointRepo } from "../persistence/checkpoint-repo.js";
import type { EventRepo } from "../persistence/event-repo.js";

/**
 * Event handler function type.
 */
export type EventHandler<T = unknown> = (event: UniversalEventEnvelope<T>) => Promise<void>;

/**
 * Consumer subscription configuration.
 */
export interface ConsumerSubscription {
    /** Unique consumer/projection ID */
    consumerId: string;
    /** Event types to subscribe to */
    eventTypes: string[];
    /** Partition domains to listen on */
    partitionDomains: PartitionDomain[];
    /** Handler function */
    handler: EventHandler;
    /** Batch size for catchup processing */
    batchSize?: number;
}

/**
 * Event Consumer — subscribes to events with checkpoint-based resume.
 * Supports both real-time (via bus) and catchup (from event store) modes.
 */
export interface EventConsumer {
    /**
     * Subscribe to events. Returns unsubscribe function.
     */
    subscribe(subscription: ConsumerSubscription): () => void;

    /**
     * Catch up a consumer from its last checkpoint to current.
     * Processes events in batches with checkpointing.
     */
    catchUp(consumerId: string): Promise<{ eventsProcessed: number }>;

    /**
     * Reset a consumer's checkpoint (for full rebuild).
     */
    resetCheckpoint(consumerId: string): Promise<void>;
}

/**
 * Default implementation of EventConsumer.
 */
export class DefaultEventConsumer implements EventConsumer {
    private subscriptions = new Map<string, ConsumerSubscription>();

    constructor(
        private readonly eventRepo: EventRepo,
        private readonly checkpointRepo: CheckpointRepo,
        private readonly tenantId: string,
    ) {}

    subscribe(subscription: ConsumerSubscription): () => void {
        this.subscriptions.set(subscription.consumerId, subscription);
        return () => {
            this.subscriptions.delete(subscription.consumerId);
        };
    }

    async catchUp(consumerId: string): Promise<{ eventsProcessed: number }> {
        const subscription = this.subscriptions.get(consumerId);
        if (!subscription) {
            throw new Error(`No subscription found for consumer: ${consumerId}`);
        }

        let totalProcessed = 0;
        const batchSize = subscription.batchSize ?? 100;

        for (const domain of subscription.partitionDomains) {
            // Get last checkpoint
            const checkpoint = await this.checkpointRepo.get(
                this.tenantId,
                consumerId,
                domain,
                "*", // wildcard for all partition keys in domain
            );

            const fromSeq = checkpoint ? checkpoint.lastSequenceNo + 1n : 0n;

            // Query events from checkpoint
            const page = await this.eventRepo.query({
                tenantId: this.tenantId,
                partitionDomain: domain,
                fromSequenceNo: fromSeq,
                eventType: subscription.eventTypes.length === 1 ? subscription.eventTypes[0] : undefined,
                limit: batchSize,
            });

            // Filter by event types if multiple
            const filtered = subscription.eventTypes.length > 1
                ? page.events.filter((e) => subscription.eventTypes.includes(e.eventType))
                : page.events;

            // Process events sequentially
            for (const event of filtered) {
                await subscription.handler(event);
                totalProcessed++;

                // Update checkpoint after each event
                await this.checkpointRepo.upsert(this.tenantId, {
                    projectionId: consumerId,
                    partitionDomain: event.partitionDomain,
                    partitionKey: event.partitionKey,
                    lastEventId: event.id,
                    lastSequenceNo: event.sequenceNo,
                });
            }
        }

        return { eventsProcessed: totalProcessed };
    }

    async resetCheckpoint(consumerId: string): Promise<void> {
        await this.checkpointRepo.deleteForProjection(this.tenantId, consumerId);
    }
}
