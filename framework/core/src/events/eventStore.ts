import type { DomainEvent } from "./domainEvent.js";

/**
 * Event store contract for event sourcing.
 * Implementations can persist to database, event stream, etc.
 */
export interface EventStore {
  append(event: DomainEvent): Promise<void>;
  getEvents(aggregateId: string): Promise<DomainEvent[]>;
  getEventsByType(eventType: string): Promise<DomainEvent[]>;
}
