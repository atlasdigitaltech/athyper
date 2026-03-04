// framework/runtime/src/services/business/engines/event-store/services/event-publisher.ts

import { hashPayload } from "../domain/hash-chain.js";

import type { UniversalEventEnvelope, DocType, ActorType, PartitionDomain } from "../domain/types.js";
import type { EventRepo } from "../persistence/event-repo.js";
import type { SequenceCounterRepo } from "../persistence/sequence-counter-repo.js";

/**
 * Input for publishing a new event.
 */
export interface PublishEventInput<T = unknown> {
    eventType: string;
    eventVersion?: string;
    sourceEngine: string;
    txnId: string;
    docId: string;
    docType: DocType;
    correlationId: string;
    causationId?: string;
    actorType: ActorType;
    actorId: string;
    tenantId: string;
    entityCode?: string;
    ouId?: string;
    payload: T;
    metadata?: Record<string, unknown>;
    partitionDomain: PartitionDomain;
    partitionKey: string;
    idempotencyKey?: string;
}

/**
 * Event Publisher — publishes events to the event store.
 * Handles hash computation, sequence assignment, idempotency, and bus emission.
 */
export interface EventPublisher {
    /**
     * Publish a single event.
     * Returns the persisted event with assigned ID, sequence, and hash.
     */
    publish<T>(input: PublishEventInput<T>): Promise<UniversalEventEnvelope<T>>;

    /**
     * Publish multiple events atomically (within same transaction).
     * All events get contiguous sequence numbers within their partitions.
     */
    publishBatch<T>(inputs: PublishEventInput<T>[]): Promise<UniversalEventEnvelope<T>[]>;
}

/**
 * Default implementation of EventPublisher.
 */
export class DefaultEventPublisher implements EventPublisher {
    constructor(
        private readonly eventRepo: EventRepo,
        private readonly sequenceRepo: SequenceCounterRepo,
        private readonly onPublished?: (event: UniversalEventEnvelope) => Promise<void>,
    ) {}

    async publish<T>(input: PublishEventInput<T>): Promise<UniversalEventEnvelope<T>> {
        // Idempotency check
        if (input.idempotencyKey) {
            const exists = await this.eventRepo.existsByIdempotencyKey(input.tenantId, input.idempotencyKey);
            if (exists) {
                const events = await this.eventRepo.getByTxnId(input.tenantId, input.txnId);
                const existing = events.find(
                    (e) => e.eventType === input.eventType,
                ) as UniversalEventEnvelope<T> | undefined;
                if (existing) return existing;
            }
        }

        // Compute payload hash
        const payloadHash = await hashPayload(input.payload);

        // Persist event (repo handles sequence assignment)
        const event = await this.eventRepo.append({
            eventType: input.eventType,
            eventVersion: input.eventVersion ?? "v2.1",
            sourceEngine: input.sourceEngine,
            txnId: input.txnId,
            docId: input.docId,
            docType: input.docType,
            correlationId: input.correlationId,
            causationId: input.causationId ?? null,
            actorType: input.actorType,
            actorId: input.actorId,
            tenantId: input.tenantId,
            entityCode: input.entityCode ?? null,
            ouId: input.ouId ?? null,
            payload: input.payload as unknown,
            payloadHash,
            metadata: input.metadata ?? {},
            partitionDomain: input.partitionDomain,
            partitionKey: input.partitionKey,
        }) as UniversalEventEnvelope<T>;

        // Emit to in-memory bus for local consumers
        if (this.onPublished) {
            await this.onPublished(event as UniversalEventEnvelope);
        }

        return event;
    }

    async publishBatch<T>(inputs: PublishEventInput<T>[]): Promise<UniversalEventEnvelope<T>[]> {
        const results: UniversalEventEnvelope<T>[] = [];
        for (const input of inputs) {
            results.push(await this.publish(input));
        }
        return results;
    }
}
