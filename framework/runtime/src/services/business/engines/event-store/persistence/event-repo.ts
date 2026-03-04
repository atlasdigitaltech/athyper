// framework/runtime/src/services/business/engines/event-store/persistence/event-repo.ts

import type {
  UniversalEventEnvelope,
  EventQuery,
  EventPage,
} from "../domain/types.js";

/**
 * Event Repository — persistence layer for the universal event store.
 * Implements append-only storage with partition-aware querying.
 */
export interface EventRepo {
  /**
   * Append an event to the store.
   * Assigns sequence_no atomically via evt.next_sequence().
   * Computes payload_hash before persisting.
   */
  append(
    event: Omit<UniversalEventEnvelope, "id" | "createdAt" | "sequenceNo">,
  ): Promise<UniversalEventEnvelope>;

  /**
   * Query events with flexible filtering.
   * Results are ordered by (partition_domain, partition_key, sequence_no).
   */
  query(query: EventQuery): Promise<EventPage>;

  /**
   * Get a single event by ID.
   */
  getById(
    tenantId: string,
    eventId: string,
  ): Promise<UniversalEventEnvelope | null>;

  /**
   * Get events by transaction ID.
   */
  getByTxnId(
    tenantId: string,
    txnId: string,
  ): Promise<UniversalEventEnvelope[]>;

  /**
   * Get events by correlation ID (full causal chain).
   */
  getByCorrelationId(
    tenantId: string,
    correlationId: string,
  ): Promise<UniversalEventEnvelope[]>;

  /**
   * Get events for a specific partition from a given sequence number.
   * Used for projection catchup.
   */
  getFromSequence(
    tenantId: string,
    partitionDomain: string,
    partitionKey: string,
    fromSequenceNo: bigint,
    limit: number,
  ): Promise<EventPage>;

  /**
   * Check if an idempotency key already exists (dedup check).
   */
  existsByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<boolean>;
}
